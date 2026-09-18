import { graphql } from './gql'

/**
 * Every operation the app runs, in one module.
 *
 * The reason is not tidiness: `lib/write.ts` has to hand the *same* document objects to
 * `cache.updateQuery` that the components hand to `useQuery`. If each component declared its own
 * copy, the two would be structurally identical but not the same object, and matching them becomes
 * a matter of string comparison. Declaring once and importing on both sides makes the match a
 * reference equality — and `graphql()` is memoised per call site, so the reference really is stable.
 *
 * **`__typename` is selected explicitly** in both fragments. The codegen `client` preset skips it by
 * default, but Apollo's normalised cache always stores it, and `lib/write.ts` writes cache objects
 * by hand — so a generated type without it would describe a shape the cache never holds. Selecting
 * it makes the generated type the same shape the cache actually contains, and removes the need for
 * a cast at every socket handler.
 */

/** The fields a conversation row and the conversation header need. */
export const ConversationFields = graphql(/* GraphQL */ `
  fragment ConversationFields on Conversation {
    __typename
    id
    kind
    title
    members {
      __typename
      user {
        __typename
        id
        displayName
        avatarUrl
        title
      }
      lastReadAt
    }
    unreadCount
    lastActivityAt
    lastMessage {
      __typename
      id
      body
      sender {
        __typename
        id
        displayName
        avatarUrl
      }
      createdAt
      deletedAt
    }
  }
`)

/**
 * The list query.
 *
 * No `@client` preview field: the preview line is derived in the row component from `lastMessage`
 * using the same two rules the server's own preview uses (a channel preview gets a `Sender: `
 * prefix, a DM's does not). Deriving it here keeps one source of truth for the rule; the server
 * computes its own `preview` only because a socket activity payload has no `lastMessage` in it.
 */
export const ConversationsQuery = graphql(/* GraphQL */ `
  query Conversations {
    conversations {
      ...ConversationFields
    }
  }
`)

export const ConversationQuery = graphql(/* GraphQL */ `
  query Conversation($id: ID!) {
    conversation(id: $id) {
      ...ConversationFields
    }
  }
`)

export const MessageFields = graphql(/* GraphQL */ `
  fragment MessageFields on Message {
    __typename
    id
    conversationId
    body
    sender {
      __typename
      id
      displayName
      avatarUrl
      title
    }
    replyTo {
      __typename
      messageId
      senderId
      senderDisplayName
      bodyExcerpt
      createdAt
    }
    createdAt
    deletedAt
  }
`)

/**
 * Newest first, as the server returns them. The stream component reverses for display rather than
 * the query doing it, so the server's ordering contract stays visible in one place.
 */
export const MessagesQuery = graphql(/* GraphQL */ `
  query Messages($conversationId: ID!, $limit: Int) {
    messages(conversationId: $conversationId, limit: $limit) {
      ...MessageFields
    }
  }
`)

/**
 * The mutation results reuse the message fragment, so a sent message and a received one are the
 * same shape and land in the same normalised entity — which is what makes the sender's own
 * optimistic/echo pair collapse into one row.
 */
export const SendMessageMutation = graphql(/* GraphQL */ `
  mutation SendMessage($input: SendMessageInput!) {
    sendMessage(input: $input) {
      message {
        ...MessageFields
      }
      conversation {
        ...ConversationFields
      }
    }
  }
`)

export const DeleteMessageMutation = graphql(/* GraphQL */ `
  mutation DeleteMessage($id: ID!) {
    deleteMessage(id: $id) {
      messageId
      conversationId
      conversation {
        ...ConversationFields
      }
    }
  }
`)

export const MarkConversationReadMutation = graphql(/* GraphQL */ `
  mutation MarkConversationRead($conversationId: ID!) {
    markConversationRead(conversationId: $conversationId) {
      unreadCount
      conversation {
        ...ConversationFields
      }
    }
  }
`)

/**
 * The identity switcher's data source. Separate from `ConversationsQuery` because it is needed
 * before an identity exists — the switcher is how you pick one.
 */
export const UsersQuery = graphql(/* GraphQL */ `
  query Users {
    users {
      id
      displayName
      avatarUrl
      title
    }
  }
`)
