import { InMemoryCache } from '@apollo/client'
import type { RealtimeConversationActivity, RealtimeMessage } from '@pulsechat/shared/realtime'
import { describe, expect, it } from 'vitest'

import { conversationPreview } from '../features/conversations/rows'
import { ConversationsQuery, MessagesQuery } from '../graphql'
import {
  type CachedConversation,
  type CachedMessage,
  MESSAGES_QUERY_LIMIT,
  applyConversationActivity,
  applyMessageCreated,
  applyMessageDeleted,
  mergeMessage,
  sortConversations,
} from './write'

/**
 * The two pieces of `write.ts` that carry real logic, exercised without a cache.
 *
 * They are extracted from the cache writes precisely so they can be tested this way: the
 * `updateQuery` bodies around them are mechanical once these two behave.
 */

describe('sortConversations', () => {
  const older = { id: 'older', lastActivityAt: '2026-09-18T09:00:00.000Z' }
  const newer = { id: 'newer', lastActivityAt: '2026-09-18T11:00:00.000Z' }

  it('orders by lastActivityAt, newest first', () => {
    expect(sortConversations([older, newer]).map((row) => row.id)).toEqual(['newer', 'older'])
  })

  it('does not mutate the input array', () => {
    const input = [older, newer]
    const sorted = sortConversations(input)

    expect(sorted).not.toBe(input)
    expect(input.map((row) => row.id)).toEqual(['older', 'newer'])
  })

  it('treats an unparseable timestamp as epoch rather than throwing', () => {
    // A malformed value should sink to the bottom, not crash the list pane.
    const broken = { id: 'broken', lastActivityAt: 'not-a-date' }

    expect(sortConversations([older, broken]).map((row) => row.id)).toEqual(['older', 'broken'])
  })

  it('keeps its input order when two rows share a timestamp', () => {
    const twin = { id: 'twin', lastActivityAt: older.lastActivityAt }

    expect(sortConversations([older, twin]).map((row) => row.id)).toEqual(['older', 'twin'])
  })
})

describe('mergeMessage', () => {
  it('appends the first message', () => {
    const result = mergeMessage([], { id: 'm1', createdAt: '2026-09-18T10:00:00.000Z' })

    expect(result.map((message) => message.id)).toEqual(['m1'])
  })

  it('replaces an existing message in place instead of duplicating it', () => {
    // This is the sender-echo case: the server sends your own message back to your own socket.
    const existing = [
      { id: 'm1', createdAt: '2026-09-18T10:00:00.000Z', body: 'first' },
      { id: 'm2', createdAt: '2026-09-18T11:00:00.000Z', body: 'second' },
    ]

    const result = mergeMessage(existing, {
      id: 'm1',
      createdAt: '2026-09-18T10:00:00.000Z',
      body: 'from-the-server',
    })

    expect(result).toHaveLength(2)
    expect(result[0]?.body).toBe('from-the-server')
  })

  it('puts a message newer than everything present at the front', () => {
    // The array is the server's order — newest first — so the front is the newest message.
    // `MessageStream` reverses it for display: an arrival that lands at the back of this array
    // renders at the oldest end of the stream.
    const existing = [{ id: 'm1', createdAt: '2026-09-18T09:00:00.000Z' }]

    const result = mergeMessage(existing, { id: 'm2', createdAt: '2026-09-18T11:00:00.000Z' })

    expect(result.map((message) => message.id)).toEqual(['m2', 'm1'])
  })

  it('inserts a late-arriving older message after the newer ones', () => {
    const existing = [{ id: 'm2', createdAt: '2026-09-18T11:00:00.000Z' }]

    const result = mergeMessage(existing, { id: 'm1', createdAt: '2026-09-18T09:00:00.000Z' })

    expect(result.map((message) => message.id)).toEqual(['m2', 'm1'])
  })

  it('inserts between two messages when it belongs there', () => {
    const existing = [
      { id: 'newer', createdAt: '2026-09-18T15:00:00.000Z' },
      { id: 'older', createdAt: '2026-09-18T09:00:00.000Z' },
    ]

    const result = mergeMessage(existing, { id: 'middle', createdAt: '2026-09-18T12:00:00.000Z' })

    expect(result.map((message) => message.id)).toEqual(['newer', 'middle', 'older'])
  })

  it('does not mutate the input array', () => {
    const existing = [{ id: 'm1', createdAt: '2026-09-18T10:00:00.000Z' }]
    const result = mergeMessage(existing, { id: 'm2', createdAt: '2026-09-18T11:00:00.000Z' })

    expect(result).not.toBe(existing)
    expect(existing).toHaveLength(1)
  })

  it('is idempotent: applying the same event twice changes nothing', () => {
    const once = mergeMessage([], { id: 'm1', createdAt: '2026-09-18T10:00:00.000Z' })
    const twice = mergeMessage(once, { id: 'm1', createdAt: '2026-09-18T10:00:00.000Z' })

    expect(twice).toHaveLength(1)
  })
})

/**
 * The cache writes, exercised against a real `InMemoryCache`.
 *
 * The unit tests above cover the two pure helpers; these cover the seam the helpers sit in — a write
 * and the read that is supposed to observe it. Two properties are only checkable with a cache in
 * hand: that the entry those variables write is the entry a component reads, and that a row's
 * `lastMessage` ends up as a reference to the same normalised `Message` the stream uses.
 */
describe('cache writes vs what the components read', () => {
  const CONVERSATION_ID = 'conv-1'

  const baseMessage = {
    __typename: 'Message' as const,
    id: 'm1',
    conversationId: CONVERSATION_ID,
    body: 'the first message',
    sender: {
      __typename: 'User' as const,
      id: 'u1',
      displayName: 'Jerry Wilson',
      avatarUrl: null,
      title: null,
    },
    replyTo: null,
    createdAt: '2026-09-18T10:00:00.000Z',
    deletedAt: null,
  }

  function conversationRow() {
    return {
      __typename: 'Conversation' as const,
      id: CONVERSATION_ID,
      kind: 'CHANNEL' as const,
      title: 'General',
      unreadCount: 0,
      lastActivityAt: '2026-09-18T10:00:00.000Z',
      members: [
        {
          __typename: 'ConversationMember' as const,
          lastReadAt: null,
          user: {
            __typename: 'User' as const,
            id: 'u1',
            displayName: 'Jerry Wilson',
            avatarUrl: null,
            title: null,
          },
        },
      ],
      lastMessage: baseMessage,
    }
  }

  function incoming(overrides: Partial<RealtimeMessage> = {}): RealtimeMessage {
    return {
      id: 'm2',
      conversationId: CONVERSATION_ID,
      body: 'arrived over the socket',
      sender: { id: 'u2', displayName: 'Grace Hopper', avatarUrl: null, title: null },
      replyTo: null,
      createdAt: '2026-09-18T11:00:00.000Z',
      deletedAt: null,
      ...overrides,
    }
  }

  function activity(overrides: Partial<RealtimeConversationActivity> = {}) {
    return {
      conversationId: CONVERSATION_ID,
      unreadCount: 1,
      lastActivityAt: '2026-09-18T11:00:00.000Z',
      lastMessage: incoming(),
      ...overrides,
    }
  }

  /**
   * A cache primed exactly as the two components leave it after their first fetch.
   *
   * The generics are given explicitly because the generated document types are *fragment-masked*
   * while the cache holds unmasked data — the same reason `write.ts` writes its own generics.
   */
  function primedCache(): InMemoryCache {
    const cache = new InMemoryCache()
    cache.writeQuery<{ messages: CachedMessage[] }, { conversationId: string; limit: number }>({
      query: MessagesQuery,
      variables: { conversationId: CONVERSATION_ID, limit: MESSAGES_QUERY_LIMIT },
      data: { messages: [baseMessage] },
    })
    cache.writeQuery<{ conversations: CachedConversation[] }>({
      query: ConversationsQuery,
      data: { conversations: [conversationRow()] },
    })
    return cache
  }

  function readStream(cache: InMemoryCache) {
    return cache.readQuery<
      { messages: CachedMessage[] },
      { conversationId: string; limit: number }
    >({
      query: MessagesQuery,
      variables: { conversationId: CONVERSATION_ID, limit: MESSAGES_QUERY_LIMIT },
    })
  }

  function readRow(cache: InMemoryCache): CachedConversation | undefined {
    return cache.readQuery<{ conversations: CachedConversation[] }>({ query: ConversationsQuery })
      ?.conversations[0]
  }

  it('applyMessageCreated reaches the entry MessageStream reads', () => {
    const cache = primedCache()

    applyMessageCreated(
      cache,
      { conversationId: CONVERSATION_ID, limit: MESSAGES_QUERY_LIMIT },
      incoming(),
    )

    // The positive half: the write uses the same variables the stream reads with, so the message
    // lands in the entry the stream reads — at the front, because the array is newest-first.
    expect(readStream(cache)?.messages.map((message) => message.id)).toEqual(['m2', 'm1'])
  })

  it('a write under different variables misses the entry MessageStream reads', () => {
    const cache = primedCache()

    /**
     * The control case — the bug this pair of tests exists to pin. Before the two sides shared
     * `MESSAGES_QUERY_LIMIT`, the handler wrote with `{ conversationId }` while the stream read
     * with `{ conversationId, limit }`. Apollo finds no entry for the write's variables,
     * `updateQuery` has nothing to update, and the message is dropped **without an error** — which
     * is why the constant is shared rather than repeated.
     */
    applyMessageCreated(cache, { conversationId: CONVERSATION_ID }, incoming())

    expect(readStream(cache)?.messages.map((message) => message.id)).toEqual(['m1'])
  })

  it('applyMessageCreated is idempotent, so the sender echo does not double the row', () => {
    const cache = primedCache()
    const variables = { conversationId: CONVERSATION_ID, limit: MESSAGES_QUERY_LIMIT }

    applyMessageCreated(cache, variables, incoming())
    applyMessageCreated(cache, variables, incoming())

    expect(readStream(cache)?.messages).toHaveLength(2)
  })

  it('applyConversationActivity refreshes the row preview, not just the badge', () => {
    const cache = primedCache()

    applyConversationActivity(cache, activity())

    const row = readRow(cache)

    expect(row?.unreadCount).toBe(1)
    expect(row?.lastActivityAt).toBe('2026-09-18T11:00:00.000Z')
    // The row derives its preview from `lastMessage`, so this is what the user actually reads.
    expect(conversationPreview(row as CachedConversation)).toBe(
      'Grace Hopper: arrived over the socket',
    )
  })

  it('applyConversationActivity points the row at the same Message entity as the stream', () => {
    const cache = primedCache()

    applyConversationActivity(cache, activity())

    /**
     * Asserted against the store rather than through `cache.identify`: `identify` answers
     * `Message:m2` for any object carrying `__typename` and `id`, inlined or referenced, so it
     * cannot tell the two shapes apart. The stored `{ __ref }` is what makes a later delete reach
     * the row through the same entity the stream renders.
     */
    expect(cache.extract()['Conversation:conv-1']?.lastMessage).toEqual({ __ref: 'Message:m2' })
  })

  it('a deleted newest message reads as the placeholder, not the old body', () => {
    const cache = primedCache()

    /**
     * A guard rather than a state the protocol delivers: the server's `lastMessage` resolver skips
     * soft-deleted rows, so deleting the newest message moves the row back to the previous live one.
     * The branch stays so a row can never render a body nobody may read, whatever a payload says.
     */
    applyMessageDeleted(cache, 'm1', '2026-09-18T12:00:00.000Z')
    applyConversationActivity(
      cache,
      activity({ lastMessage: incoming({ id: 'm1', deletedAt: '2026-09-18T12:00:00.000Z' }) }),
    )

    expect(conversationPreview(readRow(cache) as CachedConversation)).toBe(
      'This message was deleted',
    )
  })

  it('an empty conversation clears the row lastMessage instead of keeping a stale one', () => {
    const cache = primedCache()

    applyConversationActivity(cache, activity({ lastMessage: null }))

    expect(readRow(cache)?.lastMessage).toBeNull()
  })
})
