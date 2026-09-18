import { useQuery } from '@apollo/client/react'
import { type ReactNode, useEffect, useMemo } from 'react'

import { Avatar, AvatarCollage, type AvatarUser } from '../../components/Avatar'
import { getFragmentData } from '../../gql'
import { ConversationFields, ConversationsQuery } from '../../graphql'
import { conversationLabel, conversationPreview } from './rows'

export interface ConversationListPaneProps {
  viewerId: string
  selectedId: string | null
  onSelect: (conversationId: string) => void
  /** Reports the summed unread count up to the shell's nav badge. */
  onUnreadTotalChange: (total: number) => void
}

/**
 * The middle column: every conversation the viewer takes part in, most recently active first.
 *
 * The sort is applied **here**, on read, rather than in the query or in a `Query.merge` field
 * policy (P11). Reasons, in order of weight:
 *
 *  1. a merge function that sorted would also run on every refetch and fight the server's order;
 *  2. the order depends on `lastActivityAt`, which a socket event mutates — so the value has to be
 *     read fresh anyway, and reading it fresh is exactly what this `useMemo` does.
 *
 * The consequence is that the socket handler does not have to maintain the array order, which
 * removes a whole class of "the list is right until you switch tabs" bugs.
 */
export function ConversationListPane({
  viewerId,
  selectedId,
  onSelect,
  onUnreadTotalChange,
}: ConversationListPaneProps) {
  const { data, loading, error } = useQuery(ConversationsQuery)

  const conversations = useMemo(() => {
    const rows = (data?.conversations ?? []).map((row) => getFragmentData(ConversationFields, row))

    return [...rows].sort(
      (left, right) => Date.parse(right.lastActivityAt) - Date.parse(left.lastActivityAt),
    )
  }, [data])

  const unreadTotal = useMemo(
    () => conversations.reduce((total, row) => total + row.unreadCount, 0),
    [conversations],
  )

  /**
   * The nav badge is derived from the same rows the list renders, so the two cannot disagree.
   *
   * This is an effect rather than a render-time call: notifying a parent during render would update
   * state on a component that is already rendering, and React would warn (and in StrictMode would
   * double-invoke it). The badge therefore lands one commit after the list, which is not observable
   * — the previous value is already on screen and the difference is a single frame.
   */
  useEffect(() => {
    onUnreadTotalChange(unreadTotal)
  }, [unreadTotal, onUnreadTotalChange])

  if (error !== undefined) {
    return (
      <Pane>
        <p className="text-warning p-5 text-[13px]">
          Could not load conversations: {error.message}
        </p>
      </Pane>
    )
  }

  if (loading && data === undefined) {
    return (
      <Pane>
        <p className="text-content-muted p-5 text-[13px]">Loading conversations…</p>
      </Pane>
    )
  }

  if (conversations.length === 0) {
    return (
      <Pane>
        <p className="text-content-muted p-5 text-[13px]">
          No conversations yet. Run <code className="font-mono">pnpm seed</code> to create the
          sample data.
        </p>
      </Pane>
    )
  }

  return (
    <Pane>
      <div className="border-hairline flex items-center gap-2 border-b px-5 py-[13px]">
        <SearchGlyph />
        <input
          readOnly
          aria-label="Filter conversations (not implemented)"
          placeholder="Search"
          className="text-content placeholder:text-content-muted w-full bg-transparent text-[13px] outline-none"
        />
      </div>

      <ul className="min-h-0 flex-1 overflow-y-auto">
        {conversations.map((conversation) => (
          <ConversationRow
            key={conversation.id}
            conversation={conversation}
            viewerId={viewerId}
            selected={conversation.id === selectedId}
            onSelect={onSelect}
          />
        ))}
      </ul>
    </Pane>
  )
}

function Pane({ children }: { children: ReactNode }) {
  return (
    <section
      aria-label="Conversations"
      className="border-hairline bg-card flex w-[340px] shrink-0 flex-col border-r"
    >
      {children}
    </section>
  )
}

interface ConversationRowProps {
  conversation: Parameters<typeof conversationLabel>[0]
  viewerId: string
  selected: boolean
  onSelect: (conversationId: string) => void
}

function ConversationRow({ conversation, viewerId, selected, onSelect }: ConversationRowProps) {
  const label = conversationLabel(conversation, viewerId)
  const preview = conversationPreview(conversation)

  /**
   * A channel draws a collage of its members, a DM draws the other person. Both come from the same
   * `members` array; only the presentation differs, which is why `kind` is a field rather than a
   * member-count heuristic (P3).
   */
  const avatarUsers: AvatarUser[] =
    conversation.kind === 'DM'
      ? label.counterpart === null
        ? []
        : [label.counterpart]
      : conversation.members.map((member) => member.user)

  return (
    <li>
      <button
        type="button"
        onClick={() => {
          onSelect(conversation.id)
        }}
        aria-current={selected ? 'true' : undefined}
        className={`flex w-full gap-2.5 border-none px-5 py-[15px] text-left transition-colors ${
          selected ? 'bg-card-2' : 'hover:bg-card-2/60'
        }`}
      >
        {conversation.kind === 'DM' ? (
          avatarUsers[0] === undefined ? (
            <AvatarCollage users={[]} />
          ) : (
            <span className="shrink-0">
              <Avatar user={avatarUsers[0]} />
            </span>
          )
        ) : (
          <AvatarCollage users={avatarUsers} />
        )}

        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="text-content truncate text-[16px] leading-[23px] font-medium">
              {label.name}
            </span>
            <span className="text-content-muted shrink-0 text-[12px]">
              {formatListTimestamp(conversation.lastActivityAt)}
            </span>
          </span>

          <span className="flex items-center justify-between gap-2">
            <span
              className={`truncate text-[14px] leading-5 ${
                conversation.unreadCount > 0 ? 'text-content font-medium' : 'text-content-muted'
              }`}
            >
              {preview}
            </span>

            {conversation.unreadCount > 0 && (
              <span
                aria-label={`${String(conversation.unreadCount)} unread`}
                className="rounded-badge bg-warning min-w-[18px] shrink-0 px-1.5 py-px text-center text-[11px] leading-4 font-medium text-white"
              >
                {conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}
              </span>
            )}
          </span>
        </span>
      </button>
    </li>
  )
}

/** A list timestamp: time for today, weekday within the week, else a short date. */
function formatListTimestamp(value: string): string {
  const at = new Date(value)

  if (Number.isNaN(at.getTime())) {
    return ''
  }

  const now = new Date()
  const sameDay = at.toDateString() === now.toDateString()

  if (sameDay) {
    return at.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  }

  const days = (now.getTime() - at.getTime()) / 86_400_000

  if (days < 7) {
    return at.toLocaleDateString(undefined, { weekday: 'short' })
  }

  return at.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function SearchGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="m10.5 10.5 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
