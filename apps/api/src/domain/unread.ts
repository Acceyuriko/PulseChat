/**
 * The unread count derivation (docs/plans/chat-features.md, P4).
 *
 * Unread is **derived, never stored**: a stored counter has to be incremented on send, decremented
 * on read, and corrected on delete, and any missed branch leaves the badge permanently wrong. One
 * derivation over `(lastReadAt, messages)` cannot drift.
 *
 * Note what this means for deletes: removing an unread message lowers the count exactly as a hard
 * delete would. Soft delete is not what makes the count monotonic — nothing does. What soft delete
 * buys is that the message id stays resolvable; see §4 of the plan.
 */

/** The minimum a message must expose to be counted. */
export interface UnreadCandidate {
  senderId: string
  createdAt: Date
  deletedAt?: Date | null
}

export interface UnreadInput {
  /** The viewer's read cursor. `null` means "has never read this conversation". */
  lastReadAt: Date | null
  viewerId: string
  messages: readonly UnreadCandidate[]
  /**
   * Messages can be stitched back together out of order; this is the message of truth for the
   * comparison. When omitted, the viewer's own messages are still excluded but no time filter is
   * applied beyond `lastReadAt`.
   */
  now?: Date
}

/**
 * Counts the messages the viewer has not read: newer than their cursor, from someone else, and not
 * soft-deleted.
 *
 * Three exclusions, each load-bearing:
 *   - **not from the viewer** — your own messages are read by definition, and counting them would
 *     make the badge jump every time you send.
 *   - **not deleted** — a placeholder carries no information, so it must not hold the badge open.
 *   - **strictly newer than `lastReadAt`** — a message created in the same millisecond as the
 *     cursor is treated as read, which is what makes `markConversationRead` idempotent. The cursor
 *     is set to the timestamp of the newest message the user saw, not to "now", precisely so this
 *     comparison is exact rather than racing the server clock.
 */
export function countUnread({ lastReadAt, viewerId, messages, now }: UnreadInput): number {
  const cursor = lastReadAt === null ? null : lastReadAt.getTime()
  const ceiling = now === undefined ? null : now.getTime()

  let unread = 0

  for (const message of messages) {
    if (message.senderId === viewerId) {
      continue
    }

    if ((message.deletedAt ?? null) !== null) {
      continue
    }

    const createdAt = message.createdAt.getTime()

    if (cursor !== null && createdAt <= cursor) {
      continue
    }

    if (ceiling !== null && createdAt > ceiling) {
      continue
    }

    unread += 1
  }

  return unread
}

/**
 * The cursor value `markConversationRead` should store.
 *
 * Deliberately the newest **live** message's `createdAt` rather than `new Date()`: using the
 * server clock would mark as read any message that arrived between the read query and the write,
 * and it makes the count depend on how long the request took. Falling back to the previous cursor
 * when there is nothing to read keeps the write idempotent.
 */
export function nextReadCursor(
  messages: readonly UnreadCandidate[],
  previous: Date | null,
): Date | null {
  let newest: Date | null = null

  for (const message of messages) {
    if ((message.deletedAt ?? null) !== null) {
      continue
    }

    if (newest === null || message.createdAt.getTime() > newest.getTime()) {
      newest = message.createdAt
    }
  }

  if (newest === null) {
    return previous
  }

  if (previous !== null && previous.getTime() >= newest.getTime()) {
    return previous
  }

  return newest
}
