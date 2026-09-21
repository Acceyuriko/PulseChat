import { isValidObjectId } from 'mongoose'
import { Server as SocketIOServer, type Socket } from 'socket.io'

import {
  SOCKET_EVENTS,
  type ClientToServerEvents,
  type RealtimeConversationActivity,
  type RealtimeMessage,
  type ServerToClientEvents,
  conversationRoom,
  userRoom,
} from '@pulsechat/shared/realtime'

import { ConversationModel } from '../models/conversation.js'
import { ERROR_CODES } from '../graphql/errors.js'
import { readSocketAuthUserId } from '../graphql/identity.js'

export interface RealtimeServerOptions {
  corsOrigin: string
}

interface SocketData {
  userId: string
}

type RealtimeSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>
export type RealtimeServer = SocketIOServer<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>

async function userParticipatesIn(userId: string, conversationId: string): Promise<boolean> {
  if (!isValidObjectId(conversationId)) {
    return false
  }

  const membership = await ConversationModel.exists({
    _id: conversationId,
    'members.userId': userId,
  })

  return membership !== null
}

/**
 * The handle the GraphQL layer uses to push events (docs/DECISIONS.md, D4).
 *
 * Kept as a narrow interface rather than exporting the socket.io server itself: mutations need
 * exactly these capabilities, and handing them the whole server would invite them to reach into
 * rooms and sockets directly, which is how the "writes go through GraphQL" rule erodes.
 */
export interface RealtimeEmitter {
  messageCreated(input: { conversationId: string; message: RealtimeMessage }): void
  messageDeleted(input: {
    conversationId: string
    messageId: string
    conversation: RealtimeConversationActivity
  }): void
  /** Pushed to one user's own room, e.g. after they mark a conversation read in one tab. */
  conversationActivity(userId: string, activity: RealtimeConversationActivity): void
}

export interface AttachRealtimeResult {
  io: RealtimeServer
  emitter: RealtimeEmitter
}

/**
 * Attaches socket.io to the same `http.Server` that serves GraphQL (docs/DECISIONS.md, D4).
 *
 * socket.io only ever pushes server -> client notifications here; every write goes through a
 * GraphQL mutation, so authorization and persistence live in exactly one place.
 */
export function attachRealtime(
  httpServer: import('node:http').Server,
  options: RealtimeServerOptions,
): AttachRealtimeResult {
  const io: RealtimeServer = new SocketIOServer(httpServer, {
    cors: { origin: options.corsOrigin, credentials: true },
  })

  // Identity is resolved during the handshake, so no event handler ever has to guess who is talking.
  io.use((socket, next) => {
    const userId = readSocketAuthUserId(socket.handshake.auth)

    if (userId === null || !isValidObjectId(userId)) {
      next(new Error(`${ERROR_CODES.unauthenticated}: socket handshake is missing "auth.userId"`))
      return
    }

    socket.data.userId = userId
    next()
  })

  io.on('connection', (socket: RealtimeSocket) => {
    const { userId } = socket.data
    const rooms = [userRoom(userId)]

    void socket.join(rooms)
    socket.emit(SOCKET_EVENTS.ready, { userId, joinedRooms: rooms })

    socket.on(SOCKET_EVENTS.conversationSubscribe, (conversationId) => {
      void (async () => {
        if (!(await userParticipatesIn(userId, conversationId))) {
          socket.emit(SOCKET_EVENTS.error, {
            code: ERROR_CODES.forbidden,
            message: 'You are not a participant in this conversation.',
          })
          return
        }

        await socket.join(conversationRoom(conversationId))
      })()
    })

    socket.on(SOCKET_EVENTS.conversationUnsubscribe, (conversationId) => {
      void socket.leave(conversationRoom(conversationId))
    })

    /**
     * Room membership is dropped by socket.io when the socket disconnects, so there is no leak to
     * clean up here. Stated rather than left silent because "do we leak rooms?" is a reasonable
     * question to ask of this file.
     */
  })

  const emitter: RealtimeEmitter = {
    /**
     * Fan-out is room-based, not recipient-based: every socket in `conversation:<id>` gets the
     * payload, **including the sender's own**. The client merges by message id, so a blind append
     * would render the message twice — that is the client's contract, and it is asserted in the
     * socket test.
     */
    messageCreated({ conversationId, message }) {
      io.to(conversationRoom(conversationId)).emit(SOCKET_EVENTS.messageCreated, {
        conversationId,
        message,
      })
    },

    messageDeleted({ conversationId, messageId, conversation }) {
      io.to(conversationRoom(conversationId)).emit(SOCKET_EVENTS.messageDeleted, {
        conversationId,
        messageId,
        conversation,
      })
    },

    /**
     * Goes to `user:<id>`, not to a conversation room: the point is to update the list badge
     * while the user is looking at something else. Sending it per conversation would miss every
     * tab that is not subscribed to that conversation.
     */
    conversationActivity(userId, activity) {
      io.to(userRoom(userId)).emit(SOCKET_EVENTS.conversationActivity, activity)
    },
  }

  return { io, emitter }
}
