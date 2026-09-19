import { createServer, type Server as HttpServer } from 'node:http'

import { Types } from 'mongoose'
import { type Socket, io } from 'socket.io-client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  SOCKET_AUTH_USER_ID_KEY,
  SOCKET_EVENTS,
  type ClientToServerEvents,
  type MessageCreatedPayload,
  type MessageDeletedPayload,
  type RealtimeConversationActivity,
  type ServerToClientEvents,
  type SocketReadyPayload,
} from '@pulsechat/shared/realtime'

import { createApp } from '../app.js'
import { env } from '../config/env.js'
import { connectDatabase, disconnectDatabase } from '../db/connection.js'
import { createApolloServer } from '../graphql/apollo.js'
import { ConversationModel } from '../models/conversation.js'
import { MessageModel } from '../models/message.js'
import { UserModel } from '../models/user.js'
import { attachRealtime, type RealtimeEmitter } from '../realtime/server.js'

/**
 * The realtime contract test (docs/plans/chat-features.md, P13 and module 36).
 *
 * A real HTTP server, a real socket.io server, and real `socket.io-client` connections — no mocks.
 * The point of the suite is that the contract between the two apps is *executed*, because the
 * realtime path is one of the two required items and was previously verified by nothing.
 *
 * Events are driven through the GraphQL transport rather than poked into the emitter directly: the
 * question under test is "does a mutation produce this event", not "does `emit` work".
 */
const testMongodbUri = process.env.TEST_MONGODB_URI ?? 'mongodb://127.0.0.1:27017/pulsechat_test'

const databaseReachable = await connectDatabase(testMongodbUri)
  .then(() => true)
  .catch(() => false)

if (!databaseReachable) {
  console.warn(`[api] SKIPPING socket contract tests: no MongoDB reachable at ${testMongodbUri}.`)
}

type TestSocket = Socket<ServerToClientEvents, ClientToServerEvents>

const ALICE = new Types.ObjectId()
const BOB = new Types.ObjectId()
const CAROL = new Types.ObjectId()
const ROOM_ID = new Types.ObjectId()

/** Waits for one occurrence of an event, rejecting on timeout so a missing event fails loudly. */
function once<T>(
  socket: TestSocket,
  event: keyof ServerToClientEvents,
  timeoutMs = 3_000,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event as never, handler as never)
      reject(new Error(`Timed out waiting for "${String(event)}"`))
    }, timeoutMs)

    const handler = (payload: T): void => {
      clearTimeout(timer)
      socket.off(event as never, handler as never)
      resolve(payload)
    }

    socket.on(event as never, handler as never)
  })
}

/** Collects events of a kind, so a test can assert that something did **not** arrive. */
function collect<T>(socket: TestSocket, event: keyof ServerToClientEvents): T[] {
  const received: T[] = []

  socket.on(event as never, ((payload: T) => received.push(payload)) as never)
  return received
}

async function connect(userId: string): Promise<TestSocket> {
  const socket: TestSocket = io(`http://127.0.0.1:${port}`, {
    auth: { [SOCKET_AUTH_USER_ID_KEY]: userId },
    transports: ['websocket'],
    forceNew: true,
  })

  await once<SocketReadyPayload>(socket, SOCKET_EVENTS.ready)
  return socket
}

let httpServer: HttpServer
let port: number
let baseUrl: string

/** The shape the GraphQL transport returns over `fetch`; `errors` carries the code we assert on. */
interface GraphQLResponse {
  data?: unknown
  errors?: { message: string; extensions?: { code?: string } }[]
}

/** Posts an operation as a given identity, reusing the same transport the client uses. */
async function postAs(
  userId: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<GraphQLResponse> {
  const response = await fetch(`${baseUrl}/graphql`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-user-id': userId },
    body: JSON.stringify({ query, variables }),
  })

  return (await response.json()) as GraphQLResponse
}

describe.skipIf(!databaseReachable)('socket contract', () => {
  beforeAll(async () => {
    httpServer = createServer()

    const apolloServer = createApolloServer(httpServer)
    await apolloServer.start()

    /**
     * The Express app goes on first, then socket.io — the same order as `src/index.ts`, and the
     * order the polling-handshake test below depends on.
     */
    const realtime: { emitter: RealtimeEmitter | null } = { emitter: null }

    httpServer.on(
      'request',
      createApp(apolloServer, {
        emitter: () => {
          if (realtime.emitter === null) {
            throw new Error('The realtime layer emitted before it was attached')
          }

          return realtime.emitter
        },
      }),
    )

    realtime.emitter = attachRealtime(httpServer, { corsOrigin: env.corsOrigin }).emitter

    await new Promise<void>((resolve) => {
      httpServer.listen(0, '127.0.0.1', resolve)
    })

    const address = httpServer.address()

    if (address === null || typeof address === 'string') {
      throw new Error('The test server did not report a numeric port')
    }

    port = address.port
    baseUrl = `http://127.0.0.1:${port}`

    await UserModel.create([
      { _id: ALICE, displayName: 'Alice' },
      { _id: BOB, displayName: 'Bob' },
      { _id: CAROL, displayName: 'Carol' },
    ])

    await ConversationModel.create({
      _id: ROOM_ID,
      kind: 'CHANNEL',
      title: 'Socket fixture',
      members: [
        // Alice has never read, so Bob's messages count as unread for her.
        { userId: ALICE, lastReadAt: null },
        { userId: BOB, lastReadAt: null },
      ],
    })
  })

  afterAll(async () => {
    await MessageModel.deleteMany({ conversationId: ROOM_ID })
    await ConversationModel.deleteMany({ _id: ROOM_ID })
    await UserModel.deleteMany({ _id: { $in: [ALICE, BOB, CAROL] } })

    await new Promise<void>((resolve, reject) => {
      httpServer.close((error) => (error ? reject(error) : resolve()))
    })

    await disconnectDatabase()
  })

  /**
   * The mount order above, exercised over the transport that exposes it.
   *
   * The browser's socket.io-client starts on **polling**, an ordinary `GET /socket.io/` — which the
   * `transports: ['websocket']` clients used elsewhere in this file never issue. With the app mounted
   * after `attachRealtime`, both listeners answer it and the request fails before the protocol even
   * starts, so this asserts at the HTTP layer rather than at the socket connection.
   */
  it('serves the polling handshake the browser opens with', async () => {
    const response = await fetch(`${baseUrl}/socket.io/?EIO=4&transport=polling`)

    expect(response.status).toBe(200)

    // engine.io answers a polling handshake with an open-packet carrying a session id.
    expect(await response.text()).toMatch(/^0\{/)

    // The GraphQL transport has to keep working on the same server afterwards — the two share one
    // `request` listener, so a dispatcher that swallowed the app would show up right here.
    const response2 = await fetch(`${baseUrl}/health`)
    const health = (await response2.json()) as { status: string }

    expect(response2.status).toBe(200)
    expect(health.status).toBe('ok')
  })

  it('rejects a handshake with no identity', async () => {
    const socket: TestSocket = io(`http://127.0.0.1:${port}`, {
      transports: ['websocket'],
      forceNew: true,
    })

    const error = await new Promise<Error>((resolve) => {
      socket.on('connect_error', resolve)
    })

    expect(error.message).toContain('UNAUTHENTICATED')
    socket.disconnect()
  })

  it('joins the user room and reports it in socket:ready', async () => {
    // The server emits `socket:ready` once per socket, so observing the payload means opening a
    // fresh connection. `once` keeps the handler typed rather than falling back to `any`.
    const socket = io(`http://127.0.0.1:${port}`, {
      auth: { [SOCKET_AUTH_USER_ID_KEY]: ALICE.toString() },
      transports: ['websocket'],
      forceNew: true,
    })

    const ready = await once<SocketReadyPayload>(socket, SOCKET_EVENTS.ready)

    expect(ready.userId).toBe(ALICE.toString())
    expect(ready.joinedRooms).toContain(`user:${ALICE.toString()}`)

    socket.disconnect()
  })

  it('refuses conversation:subscribe for a non-member', async () => {
    const socket = await connect(CAROL.toString())

    const errorPromise = once<{ code: string }>(socket, SOCKET_EVENTS.error)
    socket.emit(SOCKET_EVENTS.conversationSubscribe, ROOM_ID.toString())

    const error = await errorPromise

    expect(error.code).toBe('FORBIDDEN')

    socket.disconnect()
  })

  /**
   * The core round trip: a GraphQL mutation causes a socket event, and the payload matches the
   * shared contract rather than something the server invented locally.
   */
  it('delivers message:created to a subscriber with the shared payload shape', async () => {
    const socket = await connect(ALICE.toString())

    socket.emit(SOCKET_EVENTS.conversationSubscribe, ROOM_ID.toString())
    // Subscribing is asynchronous on the server (it awaits a membership query); give it a tick so
    // the message that follows cannot race the room join.
    await new Promise((resolve) => setTimeout(resolve, 100))

    const received = once<MessageCreatedPayload>(socket, SOCKET_EVENTS.messageCreated)

    const response = await postAs(
      BOB.toString(),
      `mutation ($input: SendMessageInput!) {
        sendMessage(input: $input) { message { id } }
      }`,
      { input: { conversationId: ROOM_ID.toString(), body: 'hello from Bob' } },
    )

    expect(response.errors).toBeUndefined()

    const payload = await received

    expect(payload.conversationId).toBe(ROOM_ID.toString())
    expect(payload.message.body).toBe('hello from Bob')
    expect(payload.message.sender.id).toBe(BOB.toString())
    expect(payload.message.sender.displayName).toBe('Bob')
    // Timestamps cross the socket as ISO strings — `Date` does not survive JSON.
    expect(typeof payload.message.createdAt).toBe('string')
    expect(payload.message.replyTo).toBeNull()

    socket.disconnect()
  })

  /**
   * The sender is in the conversation room and therefore receives their own event. That is by
   * design; the client's job is to merge by id rather than append. This test pins the behaviour so
   * the client contract is not silently changed.
   */
  it('also delivers message:created to the sender own socket', async () => {
    const socket = await connect(BOB.toString())

    socket.emit(SOCKET_EVENTS.conversationSubscribe, ROOM_ID.toString())
    await new Promise((resolve) => setTimeout(resolve, 100))

    const received = once<MessageCreatedPayload>(socket, SOCKET_EVENTS.messageCreated)

    await postAs(
      BOB.toString(),
      `mutation ($input: SendMessageInput!) {
        sendMessage(input: $input) { message { id } }
      }`,
      { input: { conversationId: ROOM_ID.toString(), body: 'talking to myself' } },
    )

    const payload = await received

    expect(payload.message.body).toBe('talking to myself')

    socket.disconnect()
  })

  /**
   * The badge has to update for someone who is *not* looking at the conversation, so this event
   * goes to `user:<id>` rather than to the conversation room, and the count is computed by the
   * server for that specific recipient.
   */
  it('delivers conversation:activity with a server-computed unread count', async () => {
    // No subscription on purpose: this must arrive without joining the conversation room.
    const socket = await connect(ALICE.toString())

    const received = once<RealtimeConversationActivity>(socket, SOCKET_EVENTS.conversationActivity)

    await postAs(
      BOB.toString(),
      `mutation ($input: SendMessageInput!) {
        sendMessage(input: $input) { message { id } }
      }`,
      { input: { conversationId: ROOM_ID.toString(), body: 'a message Alice has not read' } },
    )

    const activity = await received

    expect(activity.conversationId).toBe(ROOM_ID.toString())
    expect(activity.unreadCount).toBeGreaterThan(0)
    /**
     * The newest message travels as the message itself, not as a pre-rendered preview string. The
     * row derives the `Sender: ` prefix from this, so what has to hold here is that the payload
     * carries enough to do it: the sender's display name and the body.
     */
    expect(activity.lastMessage?.sender.displayName).toBe('Bob')
    expect(activity.lastMessage?.body).toBe('a message Alice has not read')
    expect(activity.lastActivityAt).toBe(activity.lastMessage?.createdAt)

    socket.disconnect()
  })

  it('does not send conversation:activity to the message sender', async () => {
    const socket = await connect(BOB.toString())
    const activity = collect<RealtimeConversationActivity>(
      socket,
      SOCKET_EVENTS.conversationActivity,
    )

    await postAs(
      BOB.toString(),
      `mutation ($input: SendMessageInput!) {
        sendMessage(input: $input) { message { id } }
      }`,
      { input: { conversationId: ROOM_ID.toString(), body: 'my own message' } },
    )

    await new Promise((resolve) => setTimeout(resolve, 250))

    expect(activity).toHaveLength(0)

    socket.disconnect()
  })

  it('isolates rooms: a non-member receives nothing', async () => {
    const socket = await connect(CAROL.toString())

    const created = collect<MessageCreatedPayload>(socket, SOCKET_EVENTS.messageCreated)
    const activity = collect<RealtimeConversationActivity>(
      socket,
      SOCKET_EVENTS.conversationActivity,
    )

    // Carol tries to subscribe to a room she is not in, and Alice sends a message.
    socket.emit(SOCKET_EVENTS.conversationSubscribe, ROOM_ID.toString())

    await postAs(
      ALICE.toString(),
      `mutation ($input: SendMessageInput!) {
        sendMessage(input: $input) { message { id } }
      }`,
      { input: { conversationId: ROOM_ID.toString(), body: 'not for Carol' } },
    )

    await new Promise((resolve) => setTimeout(resolve, 250))

    expect(created).toHaveLength(0)
    expect(activity).toHaveLength(0)

    socket.disconnect()
  })

  it('delivers message:deleted with the corrected conversation', async () => {
    const socket = await connect(ALICE.toString())

    socket.emit(SOCKET_EVENTS.conversationSubscribe, ROOM_ID.toString())
    await new Promise((resolve) => setTimeout(resolve, 100))

    const sent = await postAs(
      BOB.toString(),
      `mutation ($input: SendMessageInput!) {
        sendMessage(input: $input) { message { id } }
      }`,
      { input: { conversationId: ROOM_ID.toString(), body: 'about to be deleted' } },
    )

    const messageId = (sent.data as { sendMessage: { message: { id: string } } }).sendMessage
      .message.id

    const received = once<MessageDeletedPayload>(socket, SOCKET_EVENTS.messageDeleted)

    await postAs(BOB.toString(), `mutation ($id: ID!) { deleteMessage(id: $id) { messageId } }`, {
      id: messageId,
    })

    const payload = await received

    expect(payload.messageId).toBe(messageId)
    expect(payload.conversationId).toBe(ROOM_ID.toString())
    /**
     * The delete moved `lastMessage` backwards, so the corrected activity travels with the event.
     *
     * `lastMessage` is asserted by *identity* rather than by a preview string: the row has to end up
     * pointing at a different message than the one just deleted, and that is exactly what a stale
     * preview would hide.
     */
    expect(payload.conversation.lastMessage?.id).not.toBe(messageId)
    expect(payload.conversation.lastActivityAt).toBe(payload.conversation.lastMessage?.createdAt)

    socket.disconnect()
  })

  /**
   * The second tab. Marking read in one tab must clear the badge in the other, and the only way
   * that tab can learn about it is an event — it did not perform the read.
   */
  it('tells the reader own other tabs that the conversation was read', async () => {
    const secondTab = await connect(ALICE.toString())

    const received = once<RealtimeConversationActivity>(
      secondTab,
      SOCKET_EVENTS.conversationActivity,
    )

    await postAs(
      ALICE.toString(),
      `mutation ($id: ID!) { markConversationRead(conversationId: $id) { unreadCount } }`,
      { id: ROOM_ID.toString() },
    )

    const activity = await received

    expect(activity.conversationId).toBe(ROOM_ID.toString())
    expect(activity.unreadCount).toBe(0)

    secondTab.disconnect()
  })
})
