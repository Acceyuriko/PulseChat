import { isValidObjectId } from 'mongoose'
import { Server as SocketIOServer, type Socket } from 'socket.io'

import {
  SOCKET_EVENTS,
  type ClientToServerEvents,
  type ServerToClientEvents,
  conversationRoom,
  userRoom,
} from '@pulsechat/shared'

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
type RealtimeServer = SocketIOServer<
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
    participantIds: userId,
  })

  return membership !== null
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
): RealtimeServer {
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
  })

  return io
}
