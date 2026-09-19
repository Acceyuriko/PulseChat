import type { ConversationFieldsFragment } from '../../gql/graphql'

/**
 * The presentation rules a conversation row follows, kept out of the component so they can be
 * tested and so the component stays about layout.
 *
 * Two rules come straight from the design (docs/plans/chat-features.md, Appendix A):
 *
 *   - a **DM row is labelled with the other member's name**; a channel row with its title;
 *   - a **channel preview is prefixed with `Sender: `**, a DM preview is not, because the row
 *     already shows who you are talking to.
 *
 * The second rule is the entire justification for P3's `kind` field: it cannot be derived from the
 * member count, because a two-member channel is not a DM.
 */

export type ConversationRow = ConversationFieldsFragment

/** Roughly how much of a preview a row shows before it is cut. */
export const ROW_PREVIEW_MAX_LENGTH = 80

export interface ConversationLabel {
  /** What the row shows as the conversation's name. */
  name: string
  /** The other participant in a DM, used for the single avatar. Null for a channel. */
  counterpart: ConversationRow['members'][number]['user'] | null
}

/**
 * The row's name.
 *
 * A DM has no `title` on the server by design (P3), so it is named after the other member. "Other"
 * is resolved against the viewer rather than taken as `members[0]`, which would name the row after
 * whoever happens to be first in the array — and would show you your own name in your own DMs.
 */
export function conversationLabel(
  conversation: ConversationRow,
  viewerId: string | null,
): ConversationLabel {
  if (conversation.kind === 'CHANNEL') {
    return { name: conversation.title ?? 'Untitled channel', counterpart: null }
  }

  const counterpart =
    conversation.members.find((member) => member.user.id !== viewerId)?.user ??
    conversation.members[0]?.user ??
    null

  return { name: counterpart?.displayName ?? 'Direct message', counterpart }
}

/**
 * The preview line under the name.
 *
 * The rule lives here once, because both paths deliver the same thing: the query selects
 * `lastMessage` on first load, and the socket's `conversation:activity` carries it afterwards. A
 * deleted newest message says so rather than showing a body nobody may read any more — a guard
 * rather than a live case, since the server's `lastMessage` resolver skips soft-deleted rows.
 *
 * The body is reduced to plain text because the row is a one-line summary: a preview showing
 * `**bold**` or `[@Devon Lane](mention:…)` would leak the wire format into the list. The markdown
 * reduction is intentionally shallow here — the full parser lives on the client's render path, and
 * a preview only needs the markers gone.
 */
export function conversationPreview(conversation: ConversationRow): string {
  const lastMessage = conversation.lastMessage

  if (lastMessage === null) {
    return 'No messages yet'
  }

  if (lastMessage.deletedAt !== null) {
    return 'This message was deleted'
  }

  const text = truncate(plainText(lastMessage.body))

  return conversation.kind === 'DM' ? text : `${lastMessage.sender.displayName}: ${text}`
}

/**
 * Strips the markers a one-line preview should not show. Not a full parse: the goal is that no
 * `**`, `~~` or link syntax reaches the row.
 */
export function plainText(body: string): string {
  return body
    .replace(/\[@([^\]]+)\]\(mention:[^)]+\)/g, '@$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1$2')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Cuts to a character budget, counting **codepoints** rather than UTF-16 units.
 *
 * `slice` would split an emoji or an astral character in half and render a replacement glyph; the
 * seed data contains 🫢, so this is not hypothetical.
 */
export function truncate(text: string, max = ROW_PREVIEW_MAX_LENGTH): string {
  const characters = Array.from(text)

  return characters.length <= max ? text : `${characters.slice(0, max).join('').trimEnd()}…`
}
