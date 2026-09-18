import type { RealtimeConversationActivity, RealtimeMessage } from '@pulsechat/shared/realtime'

import { countUnread } from '../domain/unread.js'
import { parseToPlainText } from '../domain/markdown.js'
import type { ConversationDTO, MessageDTO } from '../graphql/mappers.js'

/**
 * Turns domain objects into the payloads the socket contract declares
 * (docs/plans/chat-features.md §6).
 *
 * Kept separate from the socket server so the payload shape is unit-testable without opening a
 * connection, and so there is exactly one place that decides what a preview looks like.
 */

/** How much of a body a list preview shows before it is cut. */
export const PREVIEW_MAX_LENGTH = 80

/**
 * The conversation-list preview line.
 *
 * Two rules from the design, both encoded here rather than in the renderer:
 *   - a channel preview is prefixed with `Sender: `, a DM preview is not (the row already shows
 *     the other person, so repeating their name would be noise);
 *   - the body is reduced to plain text, so a preview never leaks `**` or a mention link.
 */
export function buildPreview(
  kind: ConversationDTO['kind'],
  senderDisplayName: string,
  body: string,
): string {
  const text = parseToPlainText(body).replace(/\s+/g, ' ').trim()
  const characters = Array.from(text)
  const excerpt =
    characters.length <= PREVIEW_MAX_LENGTH
      ? text
      : `${characters.slice(0, PREVIEW_MAX_LENGTH).join('').trimEnd()}…`

  return kind === 'DM' ? excerpt : `${senderDisplayName}: ${excerpt}`
}

/**
 * A message as it travels over the socket.
 *
 * Deliberately plain JSON rather than a GraphQL DTO: this payload goes to a socket.io client that
 * has no GraphQL execution context, and `Date` does not survive `JSON.stringify` as a `Date`.
 * Timestamps are ISO strings for that reason.
 */
export function toRealtimeMessage(message: MessageDTO): RealtimeMessage {
  return {
    id: message.id,
    conversationId: message.conversationId,
    body: message.body,
    sender: {
      id: message.sender.id,
      displayName: message.sender.displayName,
      avatarUrl: message.sender.avatarUrl,
      title: message.sender.title,
    },
    replyTo:
      message.replyTo === null
        ? null
        : {
            messageId: message.replyTo.messageId,
            senderId: message.replyTo.senderId,
            senderDisplayName: message.replyTo.senderDisplayName,
            bodyExcerpt: message.replyTo.bodyExcerpt,
            createdAt: message.replyTo.createdAt.toISOString(),
          },
    createdAt: message.createdAt.toISOString(),
    deletedAt: message.deletedAt === null ? null : message.deletedAt.toISOString(),
  }
}

/**
 * One recipient's view of a conversation's activity.
 *
 * `unreadCount` is computed here, per recipient, and never incremented by the client: a client-side
 * `+1` drifts across tabs, reconnects and deletes.
 */
export function buildActivity(
  conversation: ConversationDTO,
  viewerId: string,
  lastMessage: MessageDTO | null,
  messages: readonly { senderId: string; createdAt: Date; deletedAt?: Date | null }[],
): RealtimeConversationActivity {
  const member = conversation.members.find((entry) => entry.user.id === viewerId)

  return {
    conversationId: conversation.id,
    unreadCount: countUnread({
      lastReadAt: member?.lastReadAt ?? null,
      viewerId,
      messages,
    }),
    lastActivityAt: (lastMessage?.createdAt ?? conversation.createdAt).toISOString(),
    preview:
      lastMessage === null
        ? ''
        : // A deleted message is still the newest row; the preview says so rather than showing a
          // body the user is no longer allowed to see.
          lastMessage.deletedAt === null
          ? buildPreview(conversation.kind, lastMessage.sender.displayName, lastMessage.body)
          : 'This message was deleted',
  }
}
