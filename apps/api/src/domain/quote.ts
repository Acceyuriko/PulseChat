import { QUOTE_EXCERPT_MAX_LENGTH } from '@pulsechat/shared/markdown'

import { parseToPlainText } from './markdown.js'

/**
 * Builds the frozen quote snapshot stored on a reply (docs/plans/chat-features.md, P5).
 *
 * Pure and synchronous: the caller loads the target message and hands it over, which keeps the
 * excerpt rules unit-testable without a database and stops query logic from creeping in here.
 */

export interface QuoteSource {
  id: string
  senderId: string
  senderDisplayName: string
  /** The markdown-subset body as stored, before the excerpt is cut. */
  body: string
  createdAt: Date
}

export interface QuoteSnapshotValue {
  messageId: string
  senderId: string
  senderDisplayName: string
  bodyExcerpt: string
  createdAt: Date
}

/**
 * Collapses every run of whitespace — including the newlines that separate markdown blocks — into
 * a single space.
 *
 * The card in the design is one truncated line, so a multi-paragraph quote would otherwise render
 * as a ragged block. Collapsing here rather than at render time means every consumer of the
 * snapshot sees the same string.
 */
export function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

/**
 * Cuts an excerpt from a body.
 *
 * The body is reduced to plain text first, so a preview never leaks `**` or a raw
 * `[@Grace](mention:…)` link, then collapsed, then truncated on a codepoint boundary with an
 * ellipsis. `Array.from` is what keeps a truncated multi-byte character from being split in half.
 */
export function buildExcerpt(body: string, maxLength: number = QUOTE_EXCERPT_MAX_LENGTH): string {
  const collapsed = collapseWhitespace(parseToPlainText(body))

  const characters = Array.from(collapsed)

  if (characters.length <= maxLength) {
    return collapsed
  }

  return `${characters.slice(0, maxLength).join('').trimEnd()}…`
}

/**
 * Freezes a message into a quote snapshot.
 *
 * The sender's display name is copied rather than referenced: a snapshot that had to look the name
 * up again would not be a snapshot, and the design's `Devon Lane: Check out …` line is exactly
 * this string.
 */
export function buildQuoteSnapshot(source: QuoteSource): QuoteSnapshotValue {
  return {
    messageId: source.id,
    senderId: source.senderId,
    senderDisplayName: source.senderDisplayName,
    bodyExcerpt: buildExcerpt(source.body),
    createdAt: source.createdAt,
  }
}

/**
 * Whether a quote target may be quoted.
 *
 * A deleted message is not quotable — quoting a placeholder would produce a card that says
 * nothing. The reply that already exists keeps working, because its snapshot is already frozen.
 */
export function isQuotable(source: { deletedAt?: Date | null } | null): boolean {
  return source !== null && (source.deletedAt ?? null) === null
}
