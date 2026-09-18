import {
  SOCKET_AUTH_USER_ID_KEY,
  SOCKET_EVENTS,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from '@pulsechat/shared/realtime'
import { useEffect, useState } from 'react'
import { type Socket, io } from 'socket.io-client'

const realtimeUrl = import.meta.env.VITE_REALTIME_URL ?? 'http://localhost:4000'

export type RealtimeStatus = 'idle' | 'connecting' | 'connected' | 'error'

export interface RealtimeState {
  status: RealtimeStatus
  detail: string | null
}

interface TrackedState extends RealtimeState {
  /** Which identity the status describes, so an identity switch cannot show a stale badge. */
  userId: string | null
}

/**
 * Opens the socket.io connection for the selected identity.
 *
 * Nothing is pushed over this channel yet — the scaffold proves the wiring (handshake identity,
 * `socket:ready`, room membership). Broadcasting `message:created` is the next iteration, and the
 * shared event contract in `@pulsechat/shared/realtime` is where that event will be declared.
 */
export function useRealtime(userId: string | null): RealtimeState {
  const [tracked, setTracked] = useState<TrackedState>({
    userId: null,
    status: 'idle',
    detail: null,
  })

  useEffect(() => {
    if (userId === null) {
      return
    }

    const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(realtimeUrl, {
      auth: { [SOCKET_AUTH_USER_ID_KEY]: userId },
      withCredentials: true,
    })

    socket.on(SOCKET_EVENTS.ready, (payload) => {
      setTracked({
        userId,
        status: 'connected',
        detail: `joined ${payload.joinedRooms.join(', ')}`,
      })
    })

    socket.on(SOCKET_EVENTS.error, (payload) => {
      setTracked({ userId, status: 'error', detail: `${payload.code}: ${payload.message}` })
    })

    socket.on('connect_error', (error: Error) => {
      setTracked({ userId, status: 'error', detail: error.message })
    })

    return () => {
      socket.disconnect()
    }
  }, [userId])

  // Derived instead of stored: the effect body never calls setState synchronously, and a freshly
  // selected identity always reads as `connecting` rather than inheriting the previous one's state.
  if (userId === null) {
    return { status: 'idle', detail: null }
  }

  return tracked.userId === userId
    ? { status: tracked.status, detail: tracked.detail }
    : { status: 'connecting', detail: null }
}
