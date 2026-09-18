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
const conversationId = new Types.ObjectId()
const CONVERSATION_TITLE = 'Integration fixture'
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

interface ConversationsData {
  conversations: {
    id: string
    title: string
    participants: { displayName: string }[]
    lastMessage: { body: string; sender: { displayName: string } } | null
  }[]
}

interface MeData {
  me: { id: string; displayName: string }
}

describe.skipIf(!databaseReachable)('GraphQL endpoint', () => {
  beforeAll(async () => {
    await UserModel.create([
      { _id: callerId, displayName: 'Caller' },
      { _id: peerId, displayName: 'Peer' },
    ])
    await ConversationModel.create({
      _id: conversationId,
      title: CONVERSATION_TITLE,
      participantIds: [callerId, peerId],
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
    await UserModel.deleteMany({ _id: { $in: [callerId, peerId] } })
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

  it('resolves `me` for a real identity', async () => {
    const response = await request(app)
      .post('/graphql')
      .set('x-user-id', callerId.toString())
      .send({ query: '{ me { id displayName } }' })
    const body = response.body as { data?: MeData; errors?: unknown[] }

    expect(body.errors).toBeUndefined()
    expect(body.data?.me).toEqual({ id: callerId.toString(), displayName: 'Caller' })
  })

  it('rejects a malformed conversation id with BAD_USER_INPUT', async () => {
    const response = await request(app)
      .post('/graphql')
      .set('x-user-id', callerId.toString())
      .send({ query: '{ conversation(id: "not-an-object-id") { id } }' })
    const body = response.body as GraphQLBody

    expect(readErrorCode(body)).toBe('BAD_USER_INPUT')
  })

  it('returns the caller conversations with their latest message', async () => {
    const response = await request(app)
      .post('/graphql')
      .set('x-user-id', callerId.toString())
      .send({
        query: `{
          conversations {
            id
            title
            participants { displayName }
            lastMessage { body sender { displayName } }
          }
        }`,
      })
    const body = response.body as { data?: ConversationsData; errors?: unknown[] }

    expect(body.errors).toBeUndefined()

    const [fixture] = (body.data?.conversations ?? []).filter(
      (conversation) => conversation.id === conversationId.toString(),
    )

    expect(fixture?.title).toBe(CONVERSATION_TITLE)
    expect(fixture?.participants.map((participant) => participant.displayName).sort()).toEqual([
      'Caller',
      'Peer',
    ])
    expect(fixture?.lastMessage).toEqual({
      body: MESSAGE_BODY,
      sender: { displayName: 'Peer' },
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
