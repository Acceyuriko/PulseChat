import { describe, expect, it } from 'vitest'

import { mergeMessage, sortConversations } from './write'

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

  it('inserts a late-arriving older message before newer ones', () => {
    const existing = [{ id: 'm2', createdAt: '2026-09-18T11:00:00.000Z' }]

    const result = mergeMessage(existing, { id: 'm1', createdAt: '2026-09-18T09:00:00.000Z' })

    expect(result.map((message) => message.id)).toEqual(['m1', 'm2'])
  })

  it('appends a message that is newer than everything present', () => {
    const existing = [{ id: 'm1', createdAt: '2026-09-18T09:00:00.000Z' }]

    const result = mergeMessage(existing, { id: 'm2', createdAt: '2026-09-18T11:00:00.000Z' })

    expect(result.map((message) => message.id)).toEqual(['m1', 'm2'])
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
