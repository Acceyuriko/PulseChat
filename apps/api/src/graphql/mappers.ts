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

import type { ConversationKind } from '../generated/graphql.js'

export interface UserDTO {
  id: string
  displayName: string
  avatarUrl: string | null
  title: string | null
  createdAt: Date
}

export interface QuoteSnapshotDTO {
  messageId: string
  senderId: string
  senderDisplayName: string
  bodyExcerpt: string
  createdAt: Date
}

/**
 * Note the absence of `mentions` and `replyTo`'s parent: `Message.mentions` is derived by a field
 * resolver from `body` (one source of truth), while `replyTo` is part of the document and is
 * mapped here.
 */
export interface MessageDTO {
  id: string
  conversationId: string
  body: string
  /** Requires `senderId` to have been populated. */
  sender: UserDTO
  replyTo: QuoteSnapshotDTO | null
  createdAt: Date
  deletedAt: Date | null
}

export interface ConversationMemberDTO {
  user: UserDTO
  lastReadAt: Date | null
}

/**
 * `lastMessage`, `lastActivityAt` and `unreadCount` are all resolved by field resolvers — the
 * first two because they depend on which messages are live, the third because it is viewer-scoped
 * and has no business being computed at map time. That is also why `Conversation` is registered as
 * a mapper type in `codegen.ts`.
 */
export interface ConversationDTO {
  id: string
  kind: ConversationKind
  title: string | null
  members: ConversationMemberDTO[]
  createdAt: Date
  updatedAt: Date
}

/** Structural input for `toUser` — satisfied by a hydrated (and populated) Mongoose document. */
export interface UserLike {
  _id: unknown
  displayName: string
  avatarUrl?: string | null
  title?: string | null
  createdAt: Date
}

export interface ConversationMemberLike {
  userId: unknown
  lastReadAt?: Date | null
}

export interface ConversationLike {
  _id: unknown
  kind: ConversationKind
  title?: string | null
  members: ConversationMemberLike[]
  createdAt: Date
  updatedAt: Date
}

export interface QuoteSnapshotLike {
  messageId: unknown
  senderId: unknown
  senderDisplayName: string
  bodyExcerpt: string
  createdAt: Date
}

export interface MessageLike {
  _id: unknown
  conversationId: unknown
  /** Populated by the time it reaches `toMessage`; a bare id would have no display name. */
  senderId: UserLike
  body: string
  replyTo?: QuoteSnapshotLike | null
  createdAt: Date
  deletedAt?: Date | null
}

export function toUser(doc: UserLike): UserDTO {
  return {
    id: String(doc._id),
    displayName: doc.displayName,
    avatarUrl: doc.avatarUrl ?? null,
    title: doc.title ?? null,
    createdAt: doc.createdAt,
  }
}

/**
 * `QuoteSnapshot.messageId` is a plain string on the wire, so a snapshot whose target has since
 * been deleted still maps — the whole point of freezing it.
 */
export function toQuoteSnapshot(doc: QuoteSnapshotLike): QuoteSnapshotDTO {
  return {
    messageId: String(doc.messageId),
    senderId: String(doc.senderId),
    senderDisplayName: doc.senderDisplayName,
    bodyExcerpt: doc.bodyExcerpt,
    createdAt: doc.createdAt,
  }
}

export function toMessage(doc: MessageLike): MessageDTO {
  return {
    id: String(doc._id),
    conversationId: String(doc.conversationId),
    body: doc.body,
    sender: toUser(doc.senderId),
    replyTo: doc.replyTo == null ? null : toQuoteSnapshot(doc.replyTo),
    createdAt: doc.createdAt,
    deletedAt: doc.deletedAt ?? null,
  }
}

/**
 * Maps a conversation document whose `members[].userId` has been populated.
 *
 * The populated user is read from the `userId` slot; when a caller forgot to populate, the slot
 * holds an ObjectId instead and `toUser` would produce a blank name. That is why every read path
 * in `resolvers.ts` populates — the alternative is a conversation list with empty names.
 */
export function toConversation(doc: ConversationLike): ConversationDTO {
  return {
    id: String(doc._id),
    kind: doc.kind,
    title: doc.title ?? null,
    members: doc.members.map((member) => ({
      user: toUser(member.userId as UserLike),
      lastReadAt: member.lastReadAt ?? null,
    })),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }
}
