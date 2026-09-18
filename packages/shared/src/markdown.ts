/**
 * The markdown subset the composer writes and the renderer understands.
 *
 * Both ends import these constants, so the composer and the renderer cannot disagree about which
 * characters are meaningful. The subset is deliberately small — see docs/plans/chat-features.md,
 * P2. Anything outside it renders as literal text rather than being silently dropped.
 */

/** Inline markers, longest-first so `**` is never mistaken for two `*`. */
export const MARKDOWN_MARKERS = {
  bold: '**',
  italic: '*',
  strikethrough: '~~',
} as const

/** Ordered list items look like `1. `, bullet items like `- `. */
export const ORDERED_LIST_PATTERN = /^(\d+)\.\s+/
export const BULLET_LIST_PREFIX = '- '

/** Backslash escapes the next character, so `\*` is a literal asterisk. */
export const MARKDOWN_ESCAPE = '\\'

/**
 * A mention is an inline markdown link whose destination carries the `mention:` scheme:
 * `[@Devon Lane](mention:652f...)`.
 *
 * Encoding the id in the destination rather than in the label keeps the display name and the
 * identity decoupled — renaming a user does not invalidate existing mentions — and it degrades
 * to the readable `@Devon Lane` anywhere the link syntax is not parsed.
 */
export const MENTION_SCHEME = 'mention:'

/**
 * Matches one mention link anywhere in a line.
 *
 * The label is `[^\]]+` and the id `[^)]+`: neither allows the closing delimiter, so a malformed
 * mention simply does not match and stays visible as text.
 */
export const MENTION_PATTERN = /\[@([^\]]+)\]\(mention:([^)]+)\)/g

/** What the user types to open the mention dropdown. */
export const MENTION_TRIGGER = '@'

/** Longest excerpt kept in a quote snapshot, in characters. */
export const QUOTE_EXCERPT_MAX_LENGTH = 120

/**
 * Renders a mention as markdown. The one place the wire format is produced, so the composer and
 * the seed data cannot invent two different spellings.
 */
export function formatMention(displayName: string, userId: string): string {
  return `[@${displayName}](${MENTION_SCHEME}${userId})`
}
