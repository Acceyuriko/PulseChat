/**
 * The shapes resolvers hand back to GraphQL.
 *
 * These are deliberately hand-written plain objects rather than Mongoose documents: the mapper
 * functions below are pure, which makes them trivially unit-testable without a database, and it
 * stops `_id` / `__v` from leaking into the API surface.
 *
 * `codegen.ts` wires these into `typescript-resolvers` via the `mappers` option, so the generated
 * `Resolvers` type expects exactly these shapes.
 */

export interface UserDTO {
  id: string
  displayName: string
  avatarUrl: string | null
  createdAt: Date
}

export interface MessageDTO {
  id: string
  conversationId: string
  body: string
  /** Requires `senderId` to have been populated. */
  sender: UserDTO
  createdAt: Date
}

/**
 * Note the absence of `lastMessage`: that field is resolved by a dedicated field resolver, which
 * is why `Conversation` is registered as a mapper type in `codegen.ts`.
 */
export interface ConversationDTO {
  id: string
  title: string
  participants: UserDTO[]
  createdAt: Date
  updatedAt: Date
}

/** Structural input for `toUser` — satisfied by a hydrated (and populated) Mongoose document. */
export interface UserLike {
  _id: unknown
  displayName: string
  avatarUrl?: string | null
  createdAt: Date
}

export interface ConversationLike {
  _id: unknown
  title: string
  participantIds: UserLike[]
  createdAt: Date
  updatedAt: Date
}

export interface MessageLike {
  _id: unknown
  conversationId: unknown
  senderId: UserLike
  body: string
  createdAt: Date
}

export function toUser(doc: UserLike): UserDTO {
  return {
    id: String(doc._id),
    displayName: doc.displayName,
    avatarUrl: doc.avatarUrl ?? null,
    createdAt: doc.createdAt,
  }
}

export function toMessage(doc: MessageLike): MessageDTO {
  return {
    id: String(doc._id),
    conversationId: String(doc.conversationId),
    body: doc.body,
    sender: toUser(doc.senderId),
    createdAt: doc.createdAt,
  }
}

export function toConversation(doc: ConversationLike): ConversationDTO {
  return {
    id: String(doc._id),
    title: doc.title,
    participants: doc.participantIds.map(toUser),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }
}
