import { useQuery } from '@apollo/client/react'
import { useEffect, useMemo, useRef } from 'react'

import { getFragmentData } from '../../gql'
import type { MessageFieldsFragment } from '../../gql/graphql'
import { MessageFields, MessagesQuery } from '../../graphql'
import { MESSAGES_QUERY_LIMIT } from '../../lib/write'
import { MessageRow } from './MessageRow'
import type { MentionLookup } from './mentions'

/**
 * A message is grouped with the previous one when the same person sent both this close together.
 *
 * The query's `limit` comes from `MESSAGES_QUERY_LIMIT` rather than a local constant: the socket
 * handler has to write to the *same* cache entry, Apollo keys entries by variables, and two
 * independent copies of that number would silently stop matching.
 */
const GROUPING_WINDOW_MS = 5 * 60_000

export interface MessageStreamProps {
  conversationId: string
  viewerId: string
  lookup: MentionLookup
  onQuote: (message: MessageFieldsFragment) => void
  onDelete: (message: MessageFieldsFragment) => void
}

/**
 * The message list.
 *
 * The server returns newest-first; the stream renders oldest-first, because a chat reads downwards.
 * That reversal happens here rather than in the query so the server's ordering contract stays
 * declared in one place (the SDL says "newest first").
 */
export function MessageStream({
  conversationId,
  viewerId,
  lookup,
  onQuote,
  onDelete,
}: MessageStreamProps) {
  const { data, loading, error } = useQuery(MessagesQuery, {
    variables: { conversationId, limit: MESSAGES_QUERY_LIMIT },
  })

  const messages = useMemo(() => {
    const rows = (data?.messages ?? []).map((row) => getFragmentData(MessageFields, row))

    // Newest-first from the server, so reversing gives chronological order.
    return [...rows].reverse()
  }, [data])

  const bottomRef = useRef<HTMLDivElement | null>(null)
  const previousCount = useRef(0)

  /**
   * Scroll to the newest message.
   *
   * Only when the count grows, and only to the bottom: forcing a scroll on every render would fight
   * a user who has scrolled up to read history, and re-scrolling when a message is deleted would jump
   * them somewhere they did not ask to go.
   */
  useEffect(() => {
    if (messages.length > previousCount.current) {
      bottomRef.current?.scrollIntoView({ block: 'end' })
    }

    previousCount.current = messages.length
  }, [messages.length])

  // Reset the counter when the conversation changes, so switching does not suppress the first jump.
  useEffect(() => {
    previousCount.current = 0
  }, [conversationId])

  if (error !== undefined) {
    return <p className="text-warning p-5 text-[13px]">Could not load messages: {error.message}</p>
  }

  if (loading && data === undefined) {
    return <p className="text-content-muted p-5 text-[13px]">Loading messages…</p>
  }

  if (messages.length === 0) {
    return (
      <p className="text-content-muted p-5 text-[13px]">
        No messages yet. Say something to get started.
      </p>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[30px] overflow-y-auto px-5">
      {groupByDay(messages).map((day) => (
        <section key={day.key} className="flex flex-col gap-2.5">
          <DateSeparator label={day.label} />
          <ul className="flex flex-col gap-2.5">
            {day.messages.map((message, index) => (
              <MessageRow
                key={message.id}
                message={message}
                viewerId={viewerId}
                showsHeader={isGroupStart(day.messages, index)}
                showAuthorName={true}
                lookup={lookup}
                onQuote={onQuote}
                onDelete={onDelete}
              />
            ))}
          </ul>
        </section>
      ))}
      <div ref={bottomRef} />
    </div>
  )
}

/**
 * A message starts a group when it is the first of the day, from a different author than the one
 * before it, or more than five minutes later than the one before it.
 *
 * Grouping exists so the stream does not repeat an avatar and a name on every line of a fast
 * exchange, which is what the design's message area implies.
 */
function isGroupStart(messages: MessageFieldsFragment[], index: number): boolean {
  if (index === 0) {
    return true
  }

  const previous = messages[index - 1]
  const current = messages[index]

  if (previous === undefined || current === undefined) {
    return true
  }

  if (previous.sender.id !== current.sender.id) {
    return true
  }

  return Date.parse(current.createdAt) - Date.parse(previous.createdAt) > GROUPING_WINDOW_MS
}

interface DayGroup {
  key: string
  label: string
  messages: MessageFieldsFragment[]
}

/** Splits the stream on calendar-day boundaries, in the viewer's local timezone. */
function groupByDay(messages: MessageFieldsFragment[]): DayGroup[] {
  const groups: DayGroup[] = []

  for (const message of messages) {
    const at = new Date(message.createdAt)
    const key = Number.isNaN(at.getTime()) ? 'unknown' : at.toDateString()
    const last = groups.at(-1)

    if (last === undefined || last.key !== key) {
      groups.push({ key, label: dayLabel(at), messages: [message] })
    } else {
      last.messages.push(message)
    }
  }

  return groups
}

/** `Today`, `Yesterday`, or a short date — the three cases worth distinguishing. */
function dayLabel(at: Date): string {
  if (Number.isNaN(at.getTime())) {
    return 'Unknown date'
  }

  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)

  if (at.toDateString() === today.toDateString()) {
    return 'Today'
  }

  if (at.toDateString() === yesterday.toDateString()) {
    return 'Yesterday'
  }

  return at.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}

function DateSeparator({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3" role="separator" aria-label={label}>
      <span className="bg-hairline h-px flex-1" />
      <span className="text-content-muted text-[12px]">{label}</span>
      <span className="bg-hairline h-px flex-1" />
    </div>
  )
}
