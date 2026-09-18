import { describe, expect, it } from 'vitest'

import { countUnread, nextReadCursor } from '../unread.js'

const VIEWER = 'user-me'
const PEER = 'user-peer'

function at(minutesAgo: number): Date {
  return new Date(Date.UTC(2026, 8, 1, 12, 0, 0) - minutesAgo * 60_000)
}

describe('countUnread', () => {
  it('counts messages newer than the cursor from someone else', () => {
    const unread = countUnread({
      lastReadAt: at(30),
      viewerId: VIEWER,
      messages: [
        { senderId: PEER, createdAt: at(60) },
        { senderId: PEER, createdAt: at(20) },
        { senderId: PEER, createdAt: at(10) },
      ],
    })

    expect(unread).toBe(2)
  })

  /**
   * Your own messages are read by definition. Counting them would make the badge jump every time
   * you sent something into a conversation you were not looking at.
   */
  it('never counts the viewer own messages', () => {
    const unread = countUnread({
      lastReadAt: null,
      viewerId: VIEWER,
      messages: [
        { senderId: VIEWER, createdAt: at(10) },
        { senderId: VIEWER, createdAt: at(5) },
      ],
    })

    expect(unread).toBe(0)
  })

  it('treats a null cursor as "everything is unread"', () => {
    const unread = countUnread({
      lastReadAt: null,
      viewerId: VIEWER,
      messages: [
        { senderId: PEER, createdAt: at(60) },
        { senderId: PEER, createdAt: at(30) },
      ],
    })

    expect(unread).toBe(2)
  })

  /**
   * The same-millisecond case. Treating `createdAt === lastReadAt` as read is what makes
   * `markConversationRead` idempotent: clicking twice cannot leave a phantom unread behind.
   */
  it('treats a message created exactly at the cursor as read', () => {
    const cursor = at(10)

    expect(
      countUnread({
        lastReadAt: cursor,
        viewerId: VIEWER,
        messages: [{ senderId: PEER, createdAt: cursor }],
      }),
    ).toBe(0)
  })

  it('excludes soft-deleted messages', () => {
    const unread = countUnread({
      lastReadAt: null,
      viewerId: VIEWER,
      messages: [
        { senderId: PEER, createdAt: at(20) },
        { senderId: PEER, createdAt: at(10), deletedAt: at(5) },
      ],
    })

    expect(unread).toBe(1)
  })

  /**
   * The property the plan documents: the count is derived, so a delete lowers it exactly as a hard
   * delete would. Nothing here makes it monotonic — this test exists so that is not mistaken for a
   * bug later.
   */
  it('drops by one when an unread message is deleted', () => {
    const messages = [
      { senderId: PEER, createdAt: at(20) },
      { senderId: PEER, createdAt: at(10) },
    ]

    const before = countUnread({ lastReadAt: null, viewerId: VIEWER, messages })
    const after = countUnread({
      lastReadAt: null,
      viewerId: VIEWER,
      messages: [{ ...messages[0]!, deletedAt: at(1) }, messages[1]!],
    })

    expect(before).toBe(2)
    expect(after).toBe(1)
  })

  it('ignores anything created after `now`', () => {
    const unread = countUnread({
      lastReadAt: null,
      viewerId: VIEWER,
      now: at(15),
      messages: [
        { senderId: PEER, createdAt: at(20) },
        { senderId: PEER, createdAt: at(10) },
      ],
    })

    expect(unread).toBe(1)
  })

  it('returns zero for an empty conversation', () => {
    expect(countUnread({ lastReadAt: null, viewerId: VIEWER, messages: [] })).toBe(0)
  })
})

describe('nextReadCursor', () => {
  it('advances to the newest live message', () => {
    const newest = at(5)

    expect(
      nextReadCursor(
        [
          { senderId: PEER, createdAt: at(20) },
          { senderId: PEER, createdAt: newest },
        ],
        null,
      ),
    ).toBe(newest)
  })

  /**
   * The cursor is the newest message's timestamp, not the wall clock. Using `new Date()` would
   * mark as read anything that arrived while the request was in flight.
   */
  it('never moves a cursor backwards', () => {
    const existing = at(5)

    expect(nextReadCursor([{ senderId: PEER, createdAt: at(20) }], existing)).toBe(existing)
  })

  it('skips deleted messages when picking the newest', () => {
    const live = at(20)

    expect(
      nextReadCursor(
        [
          { senderId: PEER, createdAt: at(5), deletedAt: at(1) },
          { senderId: PEER, createdAt: live },
        ],
        null,
      ),
    ).toBe(live)
  })

  it('keeps the previous cursor when there is nothing live to read', () => {
    const previous = at(30)

    expect(nextReadCursor([], previous)).toBe(previous)
    expect(nextReadCursor([{ senderId: PEER, createdAt: at(5), deletedAt: at(1) }], previous)).toBe(
      previous,
    )
  })

  it('returns null when there is neither a message nor a previous cursor', () => {
    expect(nextReadCursor([], null)).toBeNull()
  })
})
