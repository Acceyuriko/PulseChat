import { createServer } from 'node:http'

import { Types } from 'mongoose'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createApp } from '../app.js'
import { connectDatabase, disconnectDatabase } from '../db/connection.js'
import { createApolloServer } from '../graphql/apollo.js'
import { ConversationModel } from '../models/conversation.js'
import { MessageModel } from '../models/message.js'
import { UserModel } from '../models/user.js'

/**
 * Integration suite. It needs a real MongoDB, because the point of these tests is that the
 * resolver -> Mongoose -> document round trip actually works.
 *
 * When no database is reachable the suite reports that it was skipped instead of passing quietly.
 */
const testMongodbUri = process.env.TEST_MONGODB_URI ?? 'mongodb://127.0.0.1:27017/pulsechat_test'

const databaseReachable = await connectDatabase(testMongodbUri)
  .then(() => true)
  .catch(() => false)

if (!databaseReachable) {
  console.warn(
    `[api] SKIPPING integration tests: no MongoDB reachable at ${testMongodbUri}. ` +
      'Start MongoDB and re-run `pnpm test`.',
  )
}

const httpServer = createServer()
const apolloServer = createApolloServer(httpServer)
await apolloServer.start()

const app = createApp(apolloServer)

/**
 * The suite owns these documents and nothing else, so a leftover row from an interrupted run can
 * never change the outcome, and the development database is never touched.
 */
const callerId = new Types.ObjectId()
const peerId = new Types.ObjectId()
const outsiderId = new Types.ObjectId()
const conversationId = new Types.ObjectId()
const CHANNEL_TITLE = 'Integration fixture'
const MESSAGE_BODY = 'Seeded by the integration suite'

afterAll(async () => {
  await disconnectDatabase()
})

/** supertest types `body` as `any`; this is the shape the GraphQL transport actually returns. */
interface GraphQLBody {
  data?: unknown
  errors?: { message: string; extensions?: { code?: string } }[]
}

function readErrorCode(body: GraphQLBody, index = 0): string | undefined {
  return body.errors?.[index]?.extensions?.code
}

/** Posts an operation as a given identity and returns the parsed transport body. */
async function postAs(
  userId: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<{ status: number; body: GraphQLBody }> {
  const response = await request(app)
    .post('/graphql')
    .set('x-user-id', userId)
    .send({ query, variables })

  return { status: response.status, body: response.body as GraphQLBody }
}

interface MessageShape {
  id: string
  body: string
  deletedAt: string | null
  replyTo: { messageId: string; bodyExcerpt: string; senderDisplayName: string } | null
  mentions: { id: string; displayName: string }[]
  sender: { id: string; displayName: string }
}

interface ConversationShape {
  id: string
  kind: 'CHANNEL' | 'DM'
  title: string | null
  unreadCount: number
  lastActivityAt: string
  members: { user: { id: string; displayName: string }; lastReadAt: string | null }[]
  lastMessage: MessageShape | null
}

const CONVERSATION_FIELDS = `
  id
  kind
  title
  unreadCount
  lastActivityAt
  members { user { id displayName } lastReadAt }
`

describe.skipIf(!databaseReachable)('GraphQL endpoint', () => {
  beforeAll(async () => {
    await UserModel.create([
      { _id: callerId, displayName: 'Caller', title: 'CTO@Apple' },
      { _id: peerId, displayName: 'Peer' },
      { _id: outsiderId, displayName: 'Outsider' },
    ])
    await ConversationModel.create({
      _id: conversationId,
      kind: 'CHANNEL',
      title: CHANNEL_TITLE,
      members: [
        { userId: callerId, lastReadAt: null },
        { userId: peerId, lastReadAt: null },
      ],
    })
    await MessageModel.create({
      conversationId,
      senderId: peerId,
      body: MESSAGE_BODY,
    })
  })

  afterAll(async () => {
    await MessageModel.deleteMany({ conversationId })
    await ConversationModel.deleteMany({ _id: conversationId })
    await UserModel.deleteMany({ _id: { $in: [callerId, peerId, outsiderId] } })
  })

  it('answers a health query without an identity', async () => {
    const response = await request(app).post('/graphql').send({ query: '{ health }' })
    const body = response.body as GraphQLBody

    expect(response.status).toBe(200)
    expect(body.data).toEqual({ health: 'ok' })
  })

  it('rejects `me` when no identity header was sent', async () => {
    const response = await request(app).post('/graphql').send({ query: '{ me { id } }' })
    const body = response.body as GraphQLBody

    expect(body.errors).toHaveLength(1)
    expect(readErrorCode(body)).toBe('UNAUTHENTICATED')
  })

  /**
   * An identity that is well-formed but unknown is treated as "not authenticated" rather than as a
   * distinct error, so a deleted user cannot be told apart from a forged one.
   */
  it('rejects `me` for an identity that does not exist', async () => {
    const response = await request(app)
      .post('/graphql')
      .set('x-user-id', new Types.ObjectId().toString())
      .send({ query: '{ me { id } }' })
    const body = response.body as GraphQLBody

    expect(readErrorCode(body)).toBe('UNAUTHENTICATED')
  })

  it('resolves `me` with its title', async () => {
    const { body } = await postAs(callerId.toString(), '{ me { id displayName title } }')
    const data = body.data as { me: { id: string; displayName: string; title: string | null } }

    expect(body.errors).toBeUndefined()
    expect(data.me).toEqual({
      id: callerId.toString(),
      displayName: 'Caller',
      title: 'CTO@Apple',
    })
  })

  it('rejects a malformed conversation id with BAD_USER_INPUT', async () => {
    const { body } = await postAs(callerId.toString(), '{ conversation(id: "nope") { id } }')

    expect(readErrorCode(body)).toBe('BAD_USER_INPUT')
  })

  /**
   * A non-member gets `NOT_FOUND`, not `FORBIDDEN` — distinguishing the two would let anyone
   * probe for which conversation ids exist.
   */
  it('reports NOT_FOUND to a non-member', async () => {
    const { body } = await postAs(
      outsiderId.toString(),
      `query ($id: ID!) { conversation(id: $id) { id } }`,
      { id: conversationId.toString() },
    )

    expect(readErrorCode(body)).toBe('NOT_FOUND')
  })

  it('returns the caller conversations with members and an unread count', async () => {
    const { body } = await postAs(
      callerId.toString(),
      `{
        conversations {
          ${CONVERSATION_FIELDS}
          lastMessage { id body sender { displayName } }
        }
      }`,
    )

    expect(body.errors).toBeUndefined()

    const conversations = (body.data as { conversations: ConversationShape[] }).conversations
    const fixture = conversations.find((entry) => entry.id === conversationId.toString())

    expect(fixture?.title).toBe(CHANNEL_TITLE)
    expect(fixture?.kind).toBe('CHANNEL')
    expect(fixture?.members.map((member) => member.user.displayName).sort()).toEqual([
      'Caller',
      'Peer',
    ])
    // The caller has never read this conversation and the only message is from the peer.
    expect(fixture?.unreadCount).toBe(1)
    expect(fixture?.lastMessage?.body).toBe(MESSAGE_BODY)
  })

  describe('sendMessage', () => {
    it('creates a message and returns the sender-scoped conversation', async () => {
      const { body } = await postAs(
        callerId.toString(),
        `mutation ($input: SendMessageInput!) {
          sendMessage(input: $input) {
            message { id body sender { displayName } }
            conversation { ${CONVERSATION_FIELDS} }
          }
        }`,
        { input: { conversationId: conversationId.toString(), body: 'a new message' } },
      )

      expect(body.errors).toBeUndefined()

      const data = body.data as {
        sendMessage: { message: { body: string }; conversation: ConversationShape }
      }

      expect(data.sendMessage.message.body).toBe('a new message')
      expect(data.sendMessage.conversation.id).toBe(conversationId.toString())
      // Your own message is read by definition, so the count is unchanged.
      expect(data.sendMessage.conversation.unreadCount).toBe(1)
    })

    it('rejects a blank body', async () => {
      const { body } = await postAs(
        callerId.toString(),
        `mutation ($input: SendMessageInput!) {
          sendMessage(input: $input) { message { id } }
        }`,
        { input: { conversationId: conversationId.toString(), body: '   ' } },
      )

      expect(readErrorCode(body)).toBe('BAD_USER_INPUT')
    })

    it('refuses to send into a conversation the caller is not a member of', async () => {
      const { body } = await postAs(
        outsiderId.toString(),
        `mutation ($input: SendMessageInput!) {
          sendMessage(input: $input) { message { id } }
        }`,
        { input: { conversationId: conversationId.toString(), body: 'intruding' } },
      )

      expect(readErrorCode(body)).toBe('NOT_FOUND')
    })

    /**
     * The quote snapshot is the point of P5: it carries the sender's name and a plain-text excerpt
     * so the read path needs no join, and the excerpt is frozen at send time.
     */
    it('freezes a quote snapshot when replying', async () => {
      const target = await MessageModel.create({
        conversationId,
        senderId: peerId,
        body: `Check out **Vanilla Forums** [@Caller](mention:${callerId.toString()})`,
      })

      const { body } = await postAs(
        callerId.toString(),
        `mutation ($input: SendMessageInput!) {
          sendMessage(input: $input) {
            message { id replyTo { messageId bodyExcerpt senderDisplayName } }
          }
        }`,
        {
          input: {
            conversationId: conversationId.toString(),
            body: 'replying',
            replyToMessageId: target._id.toString(),
          },
        },
      )

      expect(body.errors).toBeUndefined()

      const message = (body.data as { sendMessage: { message: MessageShape } }).sendMessage.message

      expect(message.replyTo).toEqual({
        messageId: target._id.toString(),
        senderDisplayName: 'Peer',
        // Markers stripped, mention resolved to its label.
        bodyExcerpt: 'Check out Vanilla Forums @Caller',
      })
    })

    it('refuses to quote a deleted message', async () => {
      const deleted = await MessageModel.create({
        conversationId,
        senderId: peerId,
        body: 'gone',
        deletedAt: new Date(),
      })

      const { body } = await postAs(
        callerId.toString(),
        `mutation ($input: SendMessageInput!) {
          sendMessage(input: $input) { message { id } }
        }`,
        {
          input: {
            conversationId: conversationId.toString(),
            body: 'quoting a deleted message',
            replyToMessageId: deleted._id.toString(),
          },
        },
      )

      expect(readErrorCode(body)).toBe('BAD_USER_INPUT')
    })

    it('derives mentions from the body rather than storing them twice', async () => {
      const { body } = await postAs(
        callerId.toString(),
        `mutation ($input: SendMessageInput!) {
          sendMessage(input: $input) {
            message { id mentions { id displayName } }
          }
        }`,
        {
          input: {
            conversationId: conversationId.toString(),
            body: `hello [@Peer](mention:${peerId.toString()}) and [@Peer](mention:${peerId.toString()})`,
          },
        },
      )

      expect(body.errors).toBeUndefined()

      const message = (body.data as { sendMessage: { message: MessageShape } }).sendMessage.message

      expect(message.mentions).toEqual([{ id: peerId.toString(), displayName: 'Peer' }])
    })
  })

  describe('marks and deletes', () => {
    it('markConversationRead advances the cursor and zeroes the count', async () => {
      const { body } = await postAs(
        callerId.toString(),
        `mutation ($id: ID!) {
          markConversationRead(conversationId: $id) {
            unreadCount
            conversation { id unreadCount }
          }
        }`,
        { id: conversationId.toString() },
      )

      expect(body.errors).toBeUndefined()

      const payload = (
        body.data as {
          markConversationRead: { unreadCount: number; conversation: ConversationShape }
        }
      ).markConversationRead

      expect(payload.unreadCount).toBe(0)
      expect(payload.conversation.unreadCount).toBe(0)
    })

    it('markConversationRead is idempotent', async () => {
      const query = `mutation ($id: ID!) { markConversationRead(conversationId: $id) { unreadCount } }`

      const first = await postAs(callerId.toString(), query, { id: conversationId.toString() })
      const second = await postAs(callerId.toString(), query, { id: conversationId.toString() })

      const readCount = (body: GraphQLBody) =>
        (body.data as { markConversationRead: { unreadCount: number } }).markConversationRead
          .unreadCount

      expect(readCount(first.body)).toBe(0)
      expect(readCount(second.body)).toBe(0)
    })

    /**
     * The choke-point regression: a soft-deleted message must stop counting as unread, and the
     * conversation's `lastMessage` must fall back to the previous live message.
     *
     * The peer deletes their own message and the caller only observes — deletion is sender-only.
     */
    it('a soft-deleted message leaves the unread count and the last message', async () => {
      const conversation = new Types.ObjectId()
      const keep = await MessageModel.create({
        conversationId: conversation,
        senderId: peerId,
        body: 'the one that stays',
        createdAt: new Date(Date.now() - 60_000),
      })
      const doomed = await MessageModel.create({
        conversationId: conversation,
        senderId: peerId,
        body: 'the one that goes',
      })

      await ConversationModel.create({
        _id: conversation,
        kind: 'DM',
        title: null,
        members: [
          { userId: callerId, lastReadAt: null },
          { userId: peerId, lastReadAt: null },
        ],
      })

      const before = await postAs(
        callerId.toString(),
        `query ($id: ID!) {
          conversation(id: $id) { unreadCount lastMessage { id body } }
        }`,
        { id: conversation.toString() },
      )

      const beforeConversation = (before.body.data as { conversation: ConversationShape })
        .conversation

      // Both messages are unread before the delete; the newest one is the doomed one.
      expect(beforeConversation.unreadCount).toBe(2)
      expect(beforeConversation.lastMessage?.id).toBe(doomed._id.toString())

      const removed = await postAs(
        peerId.toString(),
        `mutation ($id: ID!) { deleteMessage(id: $id) { messageId conversationId } }`,
        { id: doomed._id.toString() },
      )

      expect(removed.body.errors).toBeUndefined()
      expect(
        (removed.body.data as { deleteMessage: { messageId: string } }).deleteMessage.messageId,
      ).toBe(doomed._id.toString())

      const after = await postAs(
        callerId.toString(),
        `query ($id: ID!) {
          conversation(id: $id) { unreadCount lastMessage { id body } }
        }`,
        { id: conversation.toString() },
      )

      const afterConversation = (after.body.data as { conversation: ConversationShape })
        .conversation

      // One fewer unread, and `lastMessage` moved back to the surviving message.
      expect(afterConversation.unreadCount).toBe(1)
      expect(afterConversation.lastMessage?.id).toBe(keep._id.toString())

      await MessageModel.deleteMany({ conversationId: conversation })
      await ConversationModel.deleteMany({ _id: conversation })
    })

    it('still returns a deleted message, marked as deleted, so ids stay resolvable', async () => {
      const { body } = await postAs(
        callerId.toString(),
        `query ($id: ID!) { messages(conversationId: $id) { id body deletedAt } }`,
        { id: conversationId.toString() },
      )

      const messages = (body.data as { messages: MessageShape[] }).messages
      const deleted = messages.filter((message) => message.deletedAt !== null)

      expect(deleted.length).toBeGreaterThan(0)
    })

    it('refuses to delete someone else message', async () => {
      const theirs = await MessageModel.create({
        conversationId,
        senderId: peerId,
        body: 'not yours',
      })

      const { body } = await postAs(
        callerId.toString(),
        `mutation ($id: ID!) { deleteMessage(id: $id) { messageId } }`,
        { id: theirs._id.toString() },
      )

      expect(readErrorCode(body)).toBe('FORBIDDEN')
    })
  })
})

describe.skipIf(!databaseReachable)('health endpoint', () => {
  it('reports ok', async () => {
    const response = await request(app).get('/health')
    const body = response.body as { status?: string }

    expect(response.status).toBe(200)
    expect(body.status).toBe('ok')
  })
})
