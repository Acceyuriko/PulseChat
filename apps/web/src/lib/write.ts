import type { ApolloCache } from '@apollo/client'
import type { ModifierDetails } from '@apollo/client/cache'
import type { RealtimeConversationActivity, RealtimeMessage } from '@pulsechat/shared/realtime'

import type { ConversationFieldsFragment, MessageFieldsFragment } from '../gql/graphql'
import { ConversationsQuery, MessagesQuery as MessagesDocument } from '../graphql'

/**
 * Every cache write the realtime layer performs, in one file.
 *
 * This is a deliberate split: `useRealtime` decides *when* an event arrived, this module decides
 * *what it means for the cache*. Keeping the second half here means the merge rules are testable
 * without a socket, and it is the only place that needs to know the query documents.
 *
 * The rule from the plan (P8/P11) is that **no event triggers a refetch**. A refetch after an event
 * is what would reduce socket.io to a decorative notification bell: the data would still be coming
 * from a poll of the HTTP API, and the "essential realtime feature" would be a lie. So each handler
 * writes the normalised cache directly.
 *
 * **A note on the types below.** The generated query types are *masked* — `ConversationsQuery`'s
 * rows are `{ ' $fragmentRefs'?: { … } }`, not the fragment's own fields — because the codegen
 * `client` preset enables fragment masking so a component cannot read fields it did not declare.
 * The cache, however, holds the **unmasked** data, so these helpers are typed against the fragment
 * types. That is also why `reorderConversations` reads a locally-declared shape instead of trying to
 * reconstruct the masked one.
 */

/** A conversation row as the cache holds it: the fragment's fields, unmasked. */
export type CachedConversation = ConversationFieldsFragment

/** A message as the cache holds it: the fragment's fields, unmasked. */
export type CachedMessage = MessageFieldsFragment

/** The subset of a conversation the reorder touches. */
export interface CacheConversationFacts {
  lastActivityAt: string
}

/** The newest-first comparison the list pane uses. Extractable so it can be unit-tested. */
export function sortConversations<T extends CacheConversationFacts>(rows: T[]): T[] {
  return [...rows].sort((left, right) => timestampOf(right) - timestampOf(left))
}

/**
 * A malformed timestamp sinks to the bottom instead of throwing. The alternative — `Invalid Date`
 * propagating through a comparator — makes the sort order depend on the engine's NaN handling.
 */
function timestampOf(row: CacheConversationFacts): number {
  const parsed = Date.parse(row.lastActivityAt)

  return Number.isNaN(parsed) ? 0 : parsed
}

/** A message as far as the merge rule is concerned. */
interface IdentifiableMessage {
  id: string
  createdAt: string
}

/**
 * Inserts or replaces one message, keyed by id.
 *
 * **The array is in the server's order: newest first.** `MessageStream` reverses it for display,
 * so the *front* of this array is the newest message and the *back* is the oldest — an insert
 * has to keep it that way. Getting the direction wrong puts the arriving message at the far end
 * of the stream, which is a bug you can only see, not assert on the append alone.
 *
 * The replace branch is not a nicety — it is the fix for the sender-echo problem. The server fans
 * `message:created` out to the whole conversation room, which **includes the sender's own socket**,
 * so an append would render the message the user just sent a second time. Merging by id makes the
 * echo idempotent.
 *
 * Exported for its own test; the cache callers pass the query's own element type.
 */
export function mergeMessage<T extends IdentifiableMessage>(existing: readonly T[], next: T): T[] {
  const index = existing.findIndex((message) => message.id === next.id)

  if (index >= 0) {
    return existing.map((message, position) => (position === index ? next : message))
  }

  // The insertion point is the first message *older* than the incoming one. When there is none,
  // the incoming message is the oldest present and belongs at the back — not the front.
  const nextAt = Date.parse(next.createdAt) || 0
  const insertAt = existing.findIndex((message) => (Date.parse(message.createdAt) || 0) < nextAt)
  const merged = [...existing]

  if (insertAt === -1) {
    merged.push(next)
  } else {
    merged.splice(insertAt, 0, next)
  }

  return merged
}

/**
 * Turns a socket message into the shape the messages query stores.
 *
 * `mentions` is empty rather than derived: it is a field resolver on the server (one source of
 * truth), and nothing in the stream renders it. The `__typename`s are required — without them
 * Apollo stores the object as a plain embedded value and the message stops being normalised, so a
 * delete would not reach this row.
 */
function toCacheMessage(message: RealtimeMessage): CachedMessage {
  return {
    __typename: 'Message',
    id: message.id,
    conversationId: message.conversationId,
    body: message.body,
    sender: { __typename: 'User', ...message.sender },
    replyTo: message.replyTo === null ? null : { __typename: 'QuoteSnapshot', ...message.replyTo },
    createdAt: message.createdAt,
    deletedAt: message.deletedAt,
  }
}

export interface MessagesVariables {
  conversationId: string
  limit?: number | null
}

/**
 * The `limit` `MessageStream` queries with, and the one the socket write has to reuse.
 *
 * Apollo keys a query by **document *and* variables**, so this number is part of the write's
 * contract rather than a detail of the read: `{ conversationId }` and `{ conversationId, limit }`
 * are two different cache entries. One definition, imported by both sides, is what keeps them equal.
 */
export const MESSAGES_QUERY_LIMIT = 50

/**
 * Applies `message:created` to the open conversation's message list.
 *
 * If the conversation has never been opened in this tab there is nothing to merge into, and the
 * handler returns the data untouched. That is correct rather than lazy: `messages` is paginated and
 * a partial list written here would have no pagination context, while the list row still updates
 * through `conversation:activity` and the stream is reconciled with the server when the
 * conversation opens — `MessageStream` reads `cache-and-network` precisely because this handler
 * cannot fire for a conversation the tab is not looking at.
 */
export function applyMessageCreated(
  cache: ApolloCache,
  variables: MessagesVariables,
  message: RealtimeMessage,
): void {
  cache.updateQuery<{ messages: CachedMessage[] }, MessagesVariables>(
    { query: MessagesDocument, variables },
    (data) => {
      if (data?.messages === undefined) {
        return data
      }

      return { messages: mergeMessage(data.messages, toCacheMessage(message)) }
    },
  )
}

/**
 * Applies `message:deleted`.
 *
 * The message is **not** evicted. The server returns soft-deleted rows on purpose so a quote of one
 * stays resolvable and its id stays addressable, and the renderer swaps in a placeholder based on
 * `deletedAt`. Evicting would make the id dangle the next time a reply quoted it.
 *
 * Only the `deletedAt` field is written, which is what keeps this from clobbering anything else the
 * stream read.
 */
export function applyMessageDeleted(
  cache: ApolloCache,
  messageId: string,
  deletedAt: string,
): void {
  cache.modify({
    id: cache.identify({ __typename: 'Message', id: messageId }),
    fields: {
      deletedAt: () => deletedAt,
    },
  })
}

/**
 * Applies a `RealtimeConversationActivity` payload to one conversation entity.
 *
 * `lastMessage` is written as a reference to the same normalised `Message` entity the stream uses,
 * which is what keeps the row's preview line and the message list from disagreeing: both read one
 * object. Writing it also means the preview is *derived* by the row component from real message
 * data, rather than being a server-flattened string the client would have to take on trust.
 *
 * Returns `false` when the conversation is not in the cache at all. There is deliberately no
 * fallback write: fabricating a row from an activity payload would produce a list entry whose
 * title, members and kind nobody ever fetched.
 */
export function applyConversationActivity(
  cache: ApolloCache,
  activity: RealtimeConversationActivity,
): boolean {
  const id = cache.identify({ __typename: 'Conversation', id: activity.conversationId })
  let existed = false

  cache.modify({
    id,
    fields: {
      lastActivityAt: (current: string | undefined) => {
        existed = true

        return activity.lastActivityAt ?? current
      },
      unreadCount: () => activity.unreadCount,
      /**
       * A reference rather than an inlined object: `Message` is normalised on `id`, so handing over
       * the reference means a later delete reaches this row through the same entity.
       *
       * `mergeIntoStore` is **on**: with the default the reference is created but the message's own
       * fields are never written, leaving `Conversation.lastMessage` pointing at an empty entity and
       * the row's read failing as incomplete.
       *
       * `toReference` returns `undefined` when the cache cannot key the object. Returning `undefined`
       * from a modifier means "leave this field alone", which is the safe outcome: the row keeps the
       * preview it had rather than being blanked by a payload the cache refused.
       */
      lastMessage: (_current: unknown, { toReference }: ModifierDetails) => {
        if (activity.lastMessage === null) {
          return null
        }

        return toReference(toCacheMessage(activity.lastMessage), true) ?? undefined
      },
    },
  })

  return existed
}

/**
 * Re-sorts the conversation list in the cache after an activity event.
 *
 * Deliberately *not* done with a `Query.merge` field policy. Merging is for combining incoming pages
 * of data; re-ordering by a value a socket event just changed is a different concern, and a merge
 * function that sorted would also run on every refetch, fighting the server's own order. So this is
 * called explicitly from the socket handler, and the list pane additionally sorts on read (P11) —
 * belt and braces, because the pane is what a reviewer actually looks at.
 */
export function reorderConversations(cache: ApolloCache): void {
  cache.updateQuery<{ conversations: CachedConversation[] }>(
    { query: ConversationsQuery },
    (data) => {
      if (data?.conversations === undefined) {
        return data
      }

      return { conversations: sortConversations(data.conversations) }
    },
  )
}
