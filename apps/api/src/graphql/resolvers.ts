import { isValidObjectId } from 'mongoose'

import type { Resolvers } from '../generated/graphql.js'
import { ConversationModel } from '../models/conversation.js'
import { MessageModel } from '../models/message.js'
import { UserModel } from '../models/user.js'
import type { GraphQLContext } from './context.js'
import { ERROR_CODES, graphQLError } from './errors.js'
import { IDENTITY_HEADER } from './identity.js'
import { type UserLike, toConversation, toMessage, toUser } from './mappers.js'

const MESSAGE_PAGE_SIZE = 50
const MESSAGE_PAGE_SIZE_MAX = 200

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

      const docs = await ConversationModel.find({ participantIds: currentUser.id })
        .sort({ updatedAt: -1 })
        .populate<{ participantIds: UserLike[] }>('participantIds')
        .exec()

      return docs.map(toConversation)
    },

    conversation: async (_parent, args, context) => {
      const currentUser = requireUser(context)
      assertObjectId(args.id, 'id')

      const doc = await ConversationModel.findOne({
        _id: args.id,
        participantIds: currentUser.id,
      })
        .populate<{ participantIds: UserLike[] }>('participantIds')
        .exec()

      return doc === null ? null : toConversation(doc)
    },

    messages: async (_parent, args, context) => {
      const currentUser = requireUser(context)
      assertObjectId(args.conversationId, 'conversationId')

      // Membership check first: a non-participant must not be able to read a conversation's history.
      const membership = await ConversationModel.exists({
        _id: args.conversationId,
        participantIds: currentUser.id,
      })

      if (membership === null) {
        throw graphQLError(ERROR_CODES.notFound, 'Conversation not found.')
      }

      const limit = Math.min(args.limit ?? MESSAGE_PAGE_SIZE, MESSAGE_PAGE_SIZE_MAX)

      const docs = await MessageModel.find({ conversationId: args.conversationId })
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate<{ senderId: UserLike }>('senderId')
        .exec()

      return docs.map(toMessage)
    },
  },

  Conversation: {
    /**
     * Deliberately one query per conversation: it keeps the scaffold readable, and `lastMessage` is
     * only requested by the conversation list. Swapping this for a DataLoader (or a `$lookup`
     * aggregation) is the right move once either the list or the traffic grows.
     */
    lastMessage: async (parent) => {
      const doc = await MessageModel.findOne({ conversationId: parent.id })
        .sort({ createdAt: -1 })
        .populate<{ senderId: UserLike }>('senderId')
        .exec()

      return doc === null ? null : toMessage(doc)
    },
  },
}
