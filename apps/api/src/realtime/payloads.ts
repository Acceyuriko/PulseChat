import type { RealtimeConversationActivity, RealtimeMessage } from '@pulsechat/shared/realtime'

import { countUnread } from '../domain/unread.js'
import type { ConversationDTO, MessageDTO } from '../graphql/mappers.js'

/**
 * Turns domain objects into the payloads the socket contract declares
 * (docs/plans/chat-features.md §6).
 *
 * Kept separate from the socket server so the payload shape is unit-testable without opening a
 * connection.
 */

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
 *
 * The newest message travels as itself rather than as a pre-rendered `preview` string. The client
 * derives the preview line from `lastMessage` — the same rule the row component uses on first load —
 * so there is one implementation of "channel rows are `Sender: `-prefixed, DM rows are not" instead
 * of two that can disagree.
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
    lastMessage: lastMessage === null ? null : toRealtimeMessage(lastMessage),
  }
}
