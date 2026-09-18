import type { ReactNode } from 'react'

import { Avatar } from '../../components/Avatar'
import type { MessageFieldsFragment } from '../../gql/graphql'
import { formatMessageTime } from './formatTime'
import { Markdown } from './MarkdownView'
import type { MentionLookup } from './mentions'

/**
 * One message row.
 *
 * The design's bubble geometry is asymmetric — own messages are `8px 0 8px 8px`, others' are
 * `0 8px 8px 8px` — which is what makes authorship readable at a glance without a name on every
 * message. That is encoded in the two class strings below rather than in a conditional borderRadius.
 */

export interface MessageRowProps {
  message: MessageFieldsFragment
  viewerId: string
  /** True when this is the newest message from this author — controls the avatar and name. */
  showsHeader: boolean
  /** Whether to draw the author's name above the bubble (channel only; a DM is 1:1). */
  showAuthorName: boolean
  lookup: MentionLookup
  onQuote: (message: MessageFieldsFragment) => void
  onDelete: (message: MessageFieldsFragment) => void
}

export function MessageRow({
  message,
  viewerId,
  showsHeader,
  showAuthorName,
  lookup,
  onQuote,
  onDelete,
}: MessageRowProps) {
  const isOwn = message.sender.id === viewerId
  const isDeleted = message.deletedAt !== null

  return (
    <li
      className={`group flex gap-2.5 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}
      data-testid="message-row"
      data-message-id={message.id}
    >
      {/* The avatar column keeps its width even when the avatar is hidden, so grouped messages
          stay aligned with the first one instead of drifting left. */}
      <span className="w-[30px] shrink-0">
        {showsHeader && <Avatar user={message.sender} size="sm" />}
      </span>

      <div
        className={`flex max-w-[min(560px,78%)] min-w-0 flex-col gap-1 ${isOwn ? 'items-end' : 'items-start'}`}
      >
        {showsHeader && showAuthorName && (
          <span className="text-content-muted flex items-baseline gap-2 text-[12px]">
            <span className="text-content font-medium">{message.sender.displayName}</span>
            <time dateTime={message.createdAt}>{formatMessageTime(message.createdAt)}</time>
          </span>
        )}

        <div
          className={`relative flex items-center gap-2 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}
        >
          {isDeleted ? (
            <DeletedBubble />
          ) : (
            <div
              className={
                isOwn
                  ? 'bg-outgoing text-outgoing-ink rounded-[8px_0_8px_8px] px-3 py-2'
                  : 'bg-highlight-2 text-content rounded-[0_8px_8px_8px] px-3 py-2'
              }
            >
              {message.replyTo !== null && <QuotedCard quote={message.replyTo} isOwn={isOwn} />}
              <Markdown source={message.body} viewerId={viewerId} lookup={lookup} />
            </div>
          )}

          {/*
            The hover toolbar, from the design's first frame: quote and delete.

            Rendered only for the viewer's own messages where the action is actually permitted —
            deletion is sender-only on the server, so showing delete on someone else's message would
            be a button that always fails. `group-hover` and `group-focus-within` together mean the
            toolbar is reachable by keyboard, not just by mouse.
          */}
          {!isDeleted && isOwn && (
            <span className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
              <MessageAction label="Quote this message" onClick={onQuote} message={message}>
                <QuoteGlyph />
              </MessageAction>
              <MessageAction
                label="Delete this message"
                tone="danger"
                onClick={onDelete}
                message={message}
              >
                <TrashGlyph />
              </MessageAction>
            </span>
          )}
        </div>
      </div>
    </li>
  )
}

/** A quote card: a 2px accent bar and one truncated line, exactly as the design draws it. */
function QuotedCard({
  quote,
  isOwn,
}: {
  quote: NonNullable<MessageFieldsFragment['replyTo']>
  isOwn: boolean
}) {
  return (
    <span
      data-testid="quoted-card"
      className={`mb-1.5 flex gap-2.5 rounded-[8px] px-2.5 py-2 text-[13px] leading-[1.6] ${
        isOwn ? 'bg-canvas/20' : 'bg-canvas/25'
      }`}
    >
      <span
        aria-hidden
        className={`w-0.5 shrink-0 rounded-full ${isOwn ? 'bg-outgoing-ink/40' : 'bg-outgoing'}`}
      />
      <span className="min-w-0">
        <span className={`font-medium ${isOwn ? 'text-outgoing-ink' : 'text-content'}`}>
          {quote.senderDisplayName}:{' '}
        </span>
        <span className={isOwn ? 'text-outgoing-ink/80' : 'text-content-muted'}>
          {quote.bodyExcerpt}
        </span>
      </span>
    </span>
  )
}

/**
 * The placeholder for a soft-deleted message.
 *
 * Soft delete keeps the id resolvable and the row visible, so a reply that quoted this message still
 * has something to point at (P7). Rendering nothing would silently renumber the conversation under
 * anyone reading it.
 */
function DeletedBubble() {
  return (
    <span
      data-testid="deleted-message"
      className="border-hairline text-content-muted rounded-[8px] border border-dashed px-3 py-2 text-[13px] italic"
    >
      This message was deleted
    </span>
  )
}

/**
 * A hover-toolbar button.
 *
 * It takes the message and calls `onClick(message)` rather than closing over it at the call site:
 * an inline arrow in the prop would be a new function on every render, which defeats nothing here but
 * reads as though it might.
 */
function MessageAction({
  label,
  message,
  tone = 'default',
  onClick,
  children,
}: {
  label: string
  message: MessageFieldsFragment
  tone?: 'default' | 'danger'
  onClick: (message: MessageFieldsFragment) => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={() => {
        onClick(message)
      }}
      className={`rounded-control border-hairline bg-card flex h-[30px] w-[30px] items-center justify-center border transition-colors ${
        tone === 'danger'
          ? 'text-content-muted hover:border-warning/60 hover:text-warning'
          : 'text-content-muted hover:text-content'
      }`}
    >
      {children}
    </button>
  )
}

function QuoteGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M6 4.5H4.5A1.5 1.5 0 0 0 3 6v1.5A1.5 1.5 0 0 0 4.5 9H6v1.5A1.5 1.5 0 0 1 4.5 12"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M13 4.5h-1.5A1.5 1.5 0 0 0 10 6v1.5A1.5 1.5 0 0 0 11.5 9H13v1.5a1.5 1.5 0 0 1-1.5 1.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function TrashGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M3.5 5h9M6.5 5V3.5h3V5M5 5l.6 7a1 1 0 0 0 1 1h2.8a1 1 0 0 0 1-1L11 5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
