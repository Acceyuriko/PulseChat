import { Types, isValidObjectId } from 'mongoose'

import { buildQuoteSnapshot } from '../domain/quote.js'
import { countUnread, nextReadCursor } from '../domain/unread.js'
import type { Resolvers } from '../generated/graphql.js'
import { ConversationModel } from '../models/conversation.js'
import { MessageModel } from '../models/message.js'
import { UserModel } from '../models/user.js'
import { buildActivity, toRealtimeMessage } from '../realtime/payloads.js'
import type { GraphQLContext } from './context.js'
import { ERROR_CODES, graphQLError } from './errors.js'
import { IDENTITY_HEADER } from './identity.js'
import {
  type ConversationDTO,
  type MessageLike,
  type UserLike,
  toConversation,
  toMessage,
  toUser,
} from './mappers.js'

const MESSAGE_PAGE_SIZE = 50
const MESSAGE_PAGE_SIZE_MAX = 200

/**
 * How many messages the unread derivation looks at.
 *
 * An unread count only has to be right up to the point where the badge stops being informative;
 * a cap keeps the per-conversation read bounded on a long-lived conversation. It is deliberately
 * far above any plausible unread count.
 */
const UNREAD_SCAN_LIMIT = 500

function requireUser(context: GraphQLContext) {
  if (context.currentUser === null) {
    throw graphQLError(
      ERROR_CODES.unauthenticated,
      `No identity on this request. Send a "${IDENTITY_HEADER}" header.`,
    )
  }

  return context.currentUser
}

/**
 * Keeps a malformed id from reaching Mongoose, where it would surface as a `CastError` and leak a
 * driver-level message to the client.
 */
function assertObjectId(value: string, field: string): void {
  if (!isValidObjectId(value)) {
    throw graphQLError(ERROR_CODES.badUserInput, `"${field}" is not a valid id.`)
  }
}

/**
 * Loads a conversation the caller is a member of, or throws.
 *
 * Membership is checked in the query itself rather than after the fact, so a non-member gets the
 * same `NOT_FOUND` whether the conversation does not exist or simply is not theirs. Distinguishing
 * the two would turn this into an enumeration oracle.
 *
 * Returns the mapped DTO, not the document: every caller needs the stringified id, and mapping at
 * the boundary means the document's `_id`/`__v` never reach a resolver.
 */
async function requireMembership(conversationId: string, userId: string): Promise<ConversationDTO> {
  assertObjectId(conversationId, 'conversationId')

  const doc = await ConversationModel.findOne({ _id: conversationId, 'members.userId': userId })
    .populate<{ members: { userId: UserLike; lastReadAt: Date | null }[] }>('members.userId')
    .exec()

  if (doc === null) {
    throw graphQLError(ERROR_CODES.notFound, 'Conversation not found.')
  }

  return toConversation(doc)
}

/**
 * The unread count for one viewer, computed in a single aggregation rather than by loading every
 * message and filtering in JavaScript.
 */
async function countUnreadFor(conversationId: string, userId: string): Promise<number> {
  const [row] = await ConversationModel.aggregate<{ lastReadAt: Date | null }>([
    { $match: { _id: new Types.ObjectId(conversationId) } },
    { $unwind: '$members' },
    { $match: { 'members.userId': new Types.ObjectId(userId) } },
    { $project: { _id: 0, lastReadAt: '$members.lastReadAt' } },
  ])

  const lastReadAt = row?.lastReadAt ?? null

  const messages = await MessageModel.find({ conversationId, senderId: { $ne: userId } })
    .sort({ createdAt: -1 })
    .limit(UNREAD_SCAN_LIMIT)
    .select({ senderId: 1, createdAt: 1, deletedAt: 1 })
    .exec()

  return countUnread({
    lastReadAt,
    viewerId: userId,
    messages: messages.map((message) => ({
      senderId: String(message.senderId),
      createdAt: message.createdAt,
      deletedAt: message.deletedAt ?? null,
    })),
  })
}

/**
 * The newest live message of a conversation, with its sender populated.
 *
 * The `deletedAt: null` filter is inherited from the model's `pre('find')` hook — this is the
 * choke point doing its job, which is why there is no filter written here.
 */
async function findLastMessage(conversationId: string) {
  return MessageModel.findOne({ conversationId })
    .sort({ createdAt: -1 })
    .populate<{ senderId: UserLike }>('senderId')
    .exec()
}

export const resolvers: Resolvers = {
  Query: {
    health: () => 'ok',

    me: (_parent, _args, context) => requireUser(context),

    users: async () => {
      const docs = await UserModel.find().sort({ createdAt: 1 }).exec()

      return docs.map(toUser)
    },

    conversations: async (_parent, _args, context) => {
      const currentUser = requireUser(context)

      const docs = await ConversationModel.find({ 'members.userId': currentUser.id })
        .populate<{ members: { userId: UserLike; lastReadAt: Date | null }[] }>('members.userId')
        .exec()

      const conversations = docs.map(toConversation)

      /**
       * Sorted here rather than in the query: `lastActivityAt` is the newest *live* message, which
       * lives in another collection. A handful of conversations makes the in-memory sort cheaper
       * than an aggregation; the aggregation becomes worthwhile when the list grows past a page,
       * and at that point pagination is the real answer anyway.
       */
      const withActivity = await Promise.all(
        conversations.map(async (conversation) => ({
          conversation,
          lastMessage: await findLastMessage(conversation.id),
        })),
      )

      return withActivity
        .sort((left, right) => activityAt(right) - activityAt(left))
        .map((entry) => entry.conversation)
    },

    conversation: async (_parent, args, context) => {
      const currentUser = requireUser(context)

      return requireMembership(args.id, currentUser.id)
    },

    messages: async (_parent, args, context) => {
      const currentUser = requireUser(context)

      // Membership check first: a non-member must not be able to read a conversation's history.
      await requireMembership(args.conversationId, currentUser.id)

      const limit = Math.min(args.limit ?? MESSAGE_PAGE_SIZE, MESSAGE_PAGE_SIZE_MAX)

      /**
       * Deleted messages are *included* on purpose: the client renders a placeholder, and a reply
       * that quotes one stays resolvable. `deletedAt` travels in the payload so the renderer can
       * tell the difference.
       */
      const docs = await MessageModel.find({ conversationId: args.conversationId })
        .setOptions({ includeDeleted: true })
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate<{ senderId: UserLike }>('senderId')
        .exec()

      return docs.map(toMessage)
    },
  },

  Conversation: {
    members: (parent) => parent.members,

    lastMessage: async (parent) => {
      const doc = await findLastMessage(parent.id)

      return doc === null ? null : toMessage(doc)
    },

    /**
     * The newest live message's timestamp, falling back to the conversation's own creation time so
     * an empty conversation still has a stable, sortable position.
     */
    lastActivityAt: async (parent) => {
      const [newest] = await MessageModel.find({ conversationId: parent.id })
        .sort({ createdAt: -1 })
        .limit(1)
        .select({ createdAt: 1 })
        .exec()

      return newest?.createdAt ?? parent.createdAt
    },

    unreadCount: async (parent, _args, context) => {
      const currentUser = requireUser(context)

      return countUnreadFor(parent.id, currentUser.id)
    },
  },

  Message: {
    replyTo: (parent) => parent.replyTo,

    /**
     * Derived by parsing the body, never stored: a parallel `mentionIds` array is a second source
     * of truth that can disagree with the text the user actually sent.
     */
    mentions: async (parent) => {
      const mentionedIds = extractMentionIds(parent.body)

      if (mentionedIds.length === 0) {
        return []
      }

      const docs = await UserModel.find({ _id: { $in: mentionedIds } }).exec()

      // Re-ordered to the body's order of appearance so the list reads the way the message does.
      return mentionedIds
        .map((id) => docs.find((doc) => String(doc._id) === id))
        .filter((doc) => doc !== undefined)
        .map(toUser)
    },
  },

  Mutation: {
    sendMessage: async (_parent, args, context) => {
      const currentUser = requireUser(context)
      const { conversationId, body, replyToMessageId } = args.input

      const trimmedBody = body.trim()

      if (trimmedBody === '') {
        throw graphQLError(ERROR_CODES.badUserInput, 'A message body cannot be empty.')
      }

      await requireMembership(conversationId, currentUser.id)

      /**
       * The quote snapshot is frozen here, at send time, from the message as it exists right now.
       * Doing it later would let the excerpt change under the reader.
       */
      let replyTo = null

      if (replyToMessageId != null && replyToMessageId !== '') {
        assertObjectId(replyToMessageId, 'replyToMessageId')

        const target = await MessageModel.findOne({
          _id: replyToMessageId,
          conversationId,
        })
          .setOptions({ includeDeleted: true })
          .populate<{ senderId: UserLike }>('senderId')
          .exec()

        if (target === null) {
          throw graphQLError(ERROR_CODES.notFound, 'The message being quoted was not found.')
        }

        if ((target.deletedAt ?? null) !== null) {
          throw graphQLError(ERROR_CODES.badUserInput, 'A deleted message cannot be quoted.')
        }

        replyTo = buildQuoteSnapshot({
          id: String(target._id),
          senderId: String(target.senderId._id),
          senderDisplayName: target.senderId.displayName,
          body: target.body,
          createdAt: target.createdAt,
        })
      }

      const created = await MessageModel.create({
        conversationId,
        senderId: currentUser.id,
        body: trimmedBody,
        replyTo,
      })

      const populated = await MessageModel.findById(created._id)
        .populate<{ senderId: UserLike }>('senderId')
        .exec()

      if (populated === null) {
        throw graphQLError(ERROR_CODES.notFound, 'The message could not be read back.')
      }

      const message = toMessage(populated)

      // Pushed after the write succeeded, never before: an event that arrives for a message the
      // database rejected would show a message that does not exist. Sent to the conversation room,
      // which includes the sender's own sockets — the client dedupes by id.
      context.emitter.messageCreated({ conversationId, message: toRealtimeMessage(message) })

      const conversation = await requireMembership(conversationId, currentUser.id)

      /**
       * The list badge is only meaningful for the people who did *not* send the message — the
       * sender's own view of the count is unchanged by their own message. Each recipient's payload
       * carries their own server-computed count, so the client never has to guess.
       */
      await Promise.all(
        conversation.members
          .filter((member) => member.user.id !== currentUser.id)
          .map(async (member) => {
            context.emitter.conversationActivity(
              member.user.id,
              await buildActivityFor(conversation, member.user.id, populated),
            )
          }),
      )

      return { message, conversation }
    },

    deleteMessage: async (_parent, args, context) => {
      const currentUser = requireUser(context)
      assertObjectId(args.id, 'id')

      const message = await MessageModel.findOne({ _id: args.id })
        .setOptions({ includeDeleted: true })
        .exec()

      if (message === null) {
        throw graphQLError(ERROR_CODES.notFound, 'Message not found.')
      }

      // Deleting is the sender's prerogative. Checked before membership so the two failures stay
      // distinguishable to a member, and both stay opaque to everyone else.
      if (String(message.senderId) !== currentUser.id) {
        throw graphQLError(ERROR_CODES.forbidden, 'Only the sender can delete a message.')
      }

      // Idempotent: deleting an already-deleted message is a no-op rather than an error, so a
      // retried request after a dropped response does not fail.
      if ((message.deletedAt ?? null) === null) {
        message.deletedAt = new Date()
        await message.save()
      }

      const conversationId = String(message.conversationId)
      const conversation = await requireMembership(conversationId, currentUser.id)

      /**
       * Deleting the newest message moves `lastMessage` and `lastActivityAt` backwards and can
       * reorder the list, so every member's activity travels with the event. Each member's unread
       * count is computed for them — a deleted unread message lowers it, and the client cannot
       * know that on its own.
       */
      const lastMessage = await findLastMessage(conversationId)

      await Promise.all(
        conversation.members.map(async (member) => {
          context.emitter.conversationActivity(
            member.user.id,
            await buildActivityFor(conversation, member.user.id, lastMessage),
          )
        }),
      )

      context.emitter.messageDeleted({
        conversationId,
        messageId: String(message._id),
        conversation: await buildActivityFor(conversation, currentUser.id, lastMessage),
      })

      return {
        messageId: String(message._id),
        conversationId,
        conversation,
      }
    },

    markConversationRead: async (_parent, args, context) => {
      const currentUser = requireUser(context)
      const conversation = await requireMembership(args.conversationId, currentUser.id)

      const cursor = conversation.members.find(
        (member) => member.user.id === currentUser.id,
      )?.lastReadAt

      const messages = await MessageModel.find({ conversationId: conversation.id })
        .sort({ createdAt: -1 })
        .limit(UNREAD_SCAN_LIMIT)
        .select({ createdAt: 1, deletedAt: 1 })
        .exec()

      const nextCursor = nextReadCursor(
        messages.map((message) => ({
          senderId: '',
          createdAt: message.createdAt,
          deletedAt: message.deletedAt ?? null,
        })),
        cursor ?? null,
      )

      /**
       * Written through the driver so Mongoose does not stamp `updatedAt` on the conversation:
       * reading a conversation is not activity, and letting it bump `updatedAt` would make the
       * list reorder itself every time you opened something.
       */
      if (nextCursor !== null) {
        await ConversationModel.collection.updateOne(
          {
            _id: new Types.ObjectId(conversation.id),
            'members.userId': new Types.ObjectId(currentUser.id),
          },
          { $set: { 'members.$.lastReadAt': nextCursor } },
        )
      }

      const updated = await requireMembership(args.conversationId, currentUser.id)

      /**
       * Pushed to the reader's own room so **their other tabs** clear the badge too. Without this,
       * clearing it in one tab leaves a stale capsule in the other — and the other tab cannot
       * derive the change, because it did not perform the read.
       *
       * Goes to `user:<id>`, not to the conversation room: the user's other tabs may not be
       * subscribed to a conversation they are not looking at.
       */
      context.emitter.conversationActivity(
        currentUser.id,
        await buildActivityFor(updated, currentUser.id, await findLastMessage(conversation.id)),
      )

      return {
        conversation: updated,
        unreadCount: await countUnreadFor(conversation.id, currentUser.id),
      }
    },
  },
}

/**
 * Builds one recipient's activity payload, loading the live messages the count is derived from.
 *
 * Centralised so `sendMessage`, `deleteMessage` and `markConversationRead` cannot disagree about
 * the unread count, or about which message counts as the newest.
 */
async function buildActivityFor(
  conversation: ConversationDTO,
  viewerId: string,
  lastMessage: MessageLike | null,
) {
  const messages = await MessageModel.find({
    conversationId: conversation.id,
    senderId: { $ne: viewerId },
  })
    .sort({ createdAt: -1 })
    .limit(UNREAD_SCAN_LIMIT)
    .select({ senderId: 1, createdAt: 1, deletedAt: 1 })
    .exec()

  return buildActivity(
    conversation,
    viewerId,
    lastMessage === null ? null : toMessage(lastMessage),
    messages.map((message) => ({
      senderId: String(message.senderId),
      createdAt: message.createdAt,
      deletedAt: message.deletedAt ?? null,
    })),
  )
}

/** The sort key for the conversation list: newest live message, else the conversation's age. */
function activityAt(entry: { conversation: ConversationDTO; lastMessage: MessageLike | null }) {
  return (entry.lastMessage?.createdAt ?? entry.conversation.createdAt).getTime()
}

/**
 * Mention ids are read straight out of the body with the shared pattern rather than through the
 * parser: this path only needs the ids, and it keeps the resolver free of the AST walk.
 */
function extractMentionIds(body: string): string[] {
  const ids: string[] = []

  for (const match of body.matchAll(MENTION_LINK_PATTERN)) {
    const id = match[2]?.trim()

    if (id !== undefined && id !== '' && !ids.includes(id)) {
      ids.push(id)
    }
  }

  return ids
}

const MENTION_LINK_PATTERN = /\[@([^\]]+)\]\(mention:([^)]+)\)/g
