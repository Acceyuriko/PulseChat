import { useMutation, useQuery } from '@apollo/client/react'
import { type ReactNode, useCallback, useMemo, useState } from 'react'

import { Avatar, AvatarCollage, type AvatarUser } from '../../components/Avatar'
import { getFragmentData } from '../../gql'
import type { ConversationFieldsFragment, MessageFieldsFragment } from '../../gql/graphql'
import {
  ConversationFields,
  ConversationQuery,
  DeleteMessageMutation,
  MarkConversationReadMutation,
  SendMessageMutation,
} from '../../graphql'
import type { RealtimeState } from '../../realtime/useRealtime'
import { Composer } from '../composer/Composer'
import { MessageStream } from '../messages/MessageStream'
import { toPlainText } from '../messages/markdown'
import type { MentionCandidate, MentionLookup } from '../messages/mentions'
import { RealtimePanel } from '../realtime/RealtimePanel'
import { conversationLabel } from '../conversations/rows'
import { truncate } from '../conversations/rows'

export interface ConversationPaneProps {
  conversationId: string
  viewerId: string
  realtime: RealtimeState
}

/**
 * The right-hand column: header, message stream, composer, and the realtime diagnostic panel.
 *
 * The `conversation` query runs alongside the list rather than being sliced out of the cached list
 * row. That is deliberate: the list only exposes the fields a *row* needs, and the pane wants the
 * same fields plus the member list for mentions — reading it through its own document keeps the two
 * concerns from constraining each other, and the normalised cache means the shared fields are stored
 * once anyway.
 */
export function ConversationPane({ conversationId, viewerId, realtime }: ConversationPaneProps) {
  const { data, loading, error } = useQuery(ConversationQuery, {
    variables: { id: conversationId },
  })

  const [sendMessage, sendState] = useMutation(SendMessageMutation)
  const [deleteMessage] = useMutation(DeleteMessageMutation)
  const [markConversationRead] = useMutation(MarkConversationReadMutation)

  const [quoting, setQuoting] = useState<MessageFieldsFragment | null>(null)

  const conversation = useMemo(() => {
    const row = data?.conversation

    return row === undefined || row === null ? null : getFragmentData(ConversationFields, row)
  }, [data])

  /**
   * Mention candidates are the conversation's own members (P6).
   *
   * Offering every user in the database would produce mentions of people who cannot read the
   * message, which is worse than not offering them.
   */
  const candidates: MentionCandidate[] = useMemo(
    () =>
      (conversation?.members ?? [])
        .filter((member) => member.user.id !== viewerId)
        .map((member) => ({
          id: member.user.id,
          displayName: member.user.displayName,
          title: member.user.title,
          avatarUrl: member.user.avatarUrl,
        })),
    [conversation, viewerId],
  )

  /** Resolves a mention's id to its candidate, for the tooltip a rendered mention shows. */
  const lookup: MentionLookup = useMemo(() => {
    const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]))
    const self = conversation?.members.find((member) => member.user.id === viewerId)?.user

    if (self !== undefined) {
      byId.set(self.id, {
        id: self.id,
        displayName: self.displayName,
        title: self.title,
        avatarUrl: self.avatarUrl,
      })
    }

    return { resolve: (userId) => byId.get(userId) }
  }, [candidates, conversation, viewerId])

  /**
   * Marks the conversation read.
   *
   * Called explicitly from `onFocus`/`onClick` on the pane rather than from an effect on mount.
   * An effect would fire while the user is only *looking at the list*, which would clear badges for
   * conversations they never opened — and `markConversationRead` writes through the driver and pushes
   * an activity event, so firing it speculatively is not free.
   */
  const markRead = useCallback(() => {
    void markConversationRead({ variables: { conversationId } })
  }, [markConversationRead, conversationId])

  const handleSend = (body: string) => {
    void sendMessage({
      variables: {
        input: {
          conversationId,
          body,
          replyToMessageId: quoting?.id ?? null,
        },
      },
      /**
       * No `refetchQueries` and no cache `update` for the message list.
       *
       * The mutation's own result carries the message, and the server pushes `message:created` to
       * the room — so the message arrives twice by design, and `lib/write.ts` merges by id. Adding
       * an `update` here as well would be a third writer of the same row for no benefit.
       *
       * The quote is cleared only on success: clearing it before the response would drop the user's
       * context if the send failed.
       */
    }).then(() => {
      setQuoting(null)
    })
  }

  const handleDelete = (message: MessageFieldsFragment) => {
    void deleteMessage({ variables: { id: message.id } })
  }

  if (error !== undefined) {
    return (
      <Pane>
        <p className="text-warning p-5 text-[13px]">{error.message}</p>
      </Pane>
    )
  }

  if (loading && conversation === null) {
    return (
      <Pane>
        <p className="text-content-muted p-5 text-[13px]">Loading conversation…</p>
      </Pane>
    )
  }

  if (conversation === null) {
    return (
      <Pane>
        <p className="text-content-muted p-5 text-[13px]">
          This conversation is not available. It may have been removed, or you may not be a member.
        </p>
      </Pane>
    )
  }

  const label = conversationLabel(conversation, viewerId)
  const memberCount = conversation.members.length

  return (
    <Pane>
      {/* Reading is a deliberate act, so it is the click and the focus that advance the cursor. */}
      <div
        role="presentation"
        onMouseEnter={() => {
          markRead()
        }}
        onFocus={() => {
          markRead()
        }}
        className="flex min-h-0 flex-1 flex-col"
      >
        <ConversationHeader
          conversation={conversation}
          name={label.name}
          memberCount={memberCount}
        />

        <MessageStream
          conversationId={conversationId}
          viewerId={viewerId}
          lookup={lookup}
          onQuote={setQuoting}
          onDelete={handleDelete}
        />

        <Composer
          candidates={candidates}
          quoting={
            quoting === null
              ? null
              : {
                  senderDisplayName: quoting.sender.displayName,
                  // The excerpt shown in the composer is built locally from the body, because the
                  // snapshot only exists once the message has been sent.
                  bodyExcerpt: quoteExcerptOf(quoting),
                }
          }
          onDismissQuote={() => {
            setQuoting(null)
          }}
          onSend={handleSend}
          sending={sendState.loading}
        />
      </div>

      <RealtimePanel state={realtime} />
    </Pane>
  )
}

function Pane({ children }: { children: ReactNode }) {
  return (
    <section aria-label="Conversation" className="flex min-w-0 flex-1 flex-col">
      {children}
    </section>
  )
}

function ConversationHeader({
  conversation,
  name,
  memberCount,
}: {
  conversation: ConversationFieldsFragment
  name: string
  memberCount: number
}) {
  const avatarUsers: AvatarUser[] =
    conversation.kind === 'DM'
      ? conversation.members.map((member) => member.user).slice(0, 1)
      : conversation.members.map((member) => member.user)

  return (
    <header className="border-hairline flex shrink-0 items-center gap-3 border-b px-5 py-2.5">
      {conversation.kind === 'DM' ? (
        avatarUsers[0] === undefined ? null : (
          <Avatar user={avatarUsers[0]} size="sm" />
        )
      ) : (
        <AvatarCollage users={avatarUsers} size="sm" max={2} />
      )}

      <h2 className="text-content truncate text-[18px] leading-6 font-semibold">{name}</h2>

      <span
        title={`${String(memberCount)} members`}
        className="rounded-pill border-hairline text-content-muted ml-auto shrink-0 border px-3 py-1 text-[12px] whitespace-nowrap"
      >
        {memberCount === 1 ? '1 member' : `${String(memberCount)} members`}
      </span>
    </header>
  )
}

/**
 * The one-line excerpt the quote card above the composer shows.
 *
 * The card is rendered from the message's *body*, not from a snapshot: a snapshot is only frozen when
 * the reply is sent. `toPlainText` is the same reducer the stream uses for previews, so the excerpt
 * reads identically to the message you clicked.
 */
function quoteExcerptOf(message: MessageFieldsFragment): string {
  return truncate(toPlainText(message.body), 60)
}
