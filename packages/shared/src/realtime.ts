/**
 * The realtime contract between `apps/api` (socket.io server) and `apps/web` (socket.io client).
 *
 * Architecture note (see docs/DECISIONS.md, D4): GraphQL owns every write, socket.io only pushes
 * server -> client notifications. Keeping the event names in one place is what stops the two apps
 * from drifting into hard-coded string literals on both sides.
 */

/** The message shape carried over the socket — mirrors the `Message` type in the SDL. */
export interface RealtimeMessage {
  id: string
  conversationId: string
  body: string
  sender: {
    id: string
    displayName: string
    avatarUrl: string | null
    title: string | null
  }
  replyTo: RealtimeQuoteSnapshot | null
  createdAt: string
  deletedAt: string | null
}

export interface RealtimeQuoteSnapshot {
  messageId: string
  senderId: string
  senderDisplayName: string
  bodyExcerpt: string
  createdAt: string
}

/**
 * The conversation row as the list renders it.
 *
 * `unreadCount` is computed **by the server, per recipient** — a client-side `+1` drifts across
 * tabs, reconnects and deletes, and the list has to stay correct while you are looking elsewhere.
 */
export interface RealtimeConversationActivity {
  conversationId: string
  unreadCount: number
  lastActivityAt: string
  preview: string
}

export interface SocketReadyPayload {
  /** The identity the socket was authenticated as. */
  userId: string
  /** Rooms the socket joined, e.g. `user:<id>`. */
  joinedRooms: string[]
}

export interface SocketErrorPayload {
  /** Same SCREAMING_SNAKE convention the GraphQL layer uses for `extensions.code`. */
  code: string
  message: string
}

export interface MessageCreatedPayload {
  conversationId: string
  message: RealtimeMessage
}

export interface MessageDeletedPayload {
  conversationId: string
  messageId: string
  /**
   * The conversation after the delete. Deleting the newest message moves both `lastMessage` and
   * `lastActivityAt` backwards and can reorder the list, so the corrected view travels with the
   * event rather than being guessed at from the id alone.
   */
  conversation: RealtimeConversationActivity
}

/** Events the server emits to clients. */
export interface ServerToClientEvents {
  'socket:ready': (payload: SocketReadyPayload) => void
  'socket:error': (payload: SocketErrorPayload) => void
  'message:created': (payload: MessageCreatedPayload) => void
  'message:deleted': (payload: MessageDeletedPayload) => void
  'conversation:activity': (payload: RealtimeConversationActivity) => void
}

/** Events clients emit to the server. */
export interface ClientToServerEvents {
  'conversation:subscribe': (conversationId: string) => void
  'conversation:unsubscribe': (conversationId: string) => void
}

type ServerEventName = keyof ServerToClientEvents
type ClientEventName = keyof ClientToServerEvents

/**
 * Named constants for the events declared above. The `satisfies` clause makes the build fail if a
 * constant stops matching an event name in the interfaces, so the two can never drift apart.
 */
export const SOCKET_EVENTS = {
  ready: 'socket:ready',
  error: 'socket:error',
  messageCreated: 'message:created',
  messageDeleted: 'message:deleted',
  conversationActivity: 'conversation:activity',
  conversationSubscribe: 'conversation:subscribe',
  conversationUnsubscribe: 'conversation:unsubscribe',
} as const satisfies Record<string, ServerEventName | ClientEventName>

/** Key used to carry the identity in the socket.io handshake (`io(url, { auth: { userId } })`). */
export const SOCKET_AUTH_USER_ID_KEY = 'userId'

/** Every socket for a given user joins this room, so the API can push to all of their tabs. */
export function userRoom(userId: string): string {
  return `user:${userId}`
}

/** Room for a single conversation, joined only after a participation check. */
export function conversationRoom(conversationId: string): string {
  return `conversation:${conversationId}`
}
