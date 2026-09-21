import { type KeyboardEvent, useMemo, useRef, useState } from 'react'

import { formatMention } from '@pulsechat/shared/markdown'

import { Avatar } from '../../components/Avatar'
import {
  filterCandidates,
  findMentionQuery,
  insertMention,
  type MentionCandidate,
  type MentionQuery,
} from '../messages/mentions'

/**
 * The composer.
 *
 * The value is a **plain string**, not a rich-text document. Everything the toolbar does is a
 * character insertion at the caret, and everything the renderer does is a parse of that string —
 * which is what lets the message body be the wire format itself. A contenteditable would need a
 * second serialisation step and a HTML sanitiser, and P2 exists to avoid both.
 */

export interface ComposerProps {
  candidates: MentionCandidate[]
  /** The message being quoted, if any. Drives the quote card above the input. */
  quoting: { senderDisplayName: string; bodyExcerpt: string } | null
  onDismissQuote: () => void
  onSend: (body: string) => void
  disabled?: boolean
  /** Set while a send is in flight, so the button can say so. */
  sending?: boolean
}

/**
 * The seven toolbar actions that need no upload or navigation (P2, Appendix A).
 *
 * `file`, `image`, `link` and `more` are in the design's component library but are **not rendered**:
 * they would need an upload endpoint, an image host, or a URL prompt that does not exist, and a
 * button that does nothing is worse than an absent one.
 */
const TOOLBAR = [
  { id: 'bold', label: 'Bold', marker: '**', wrap: true, wrapText: 'bold' },
  { id: 'italic', label: 'Italic', marker: '*', wrap: true, wrapText: 'italic' },
  { id: 'strike', label: 'Strikethrough', marker: '~~', wrap: true, wrapText: 'strikethrough' },
  { id: 'divider-1', divider: true },
  { id: 'ordered', label: 'Ordered list', prefix: '1. ' },
  { id: 'bullet', label: 'Bullet list', prefix: '- ' },
  { id: 'divider-2', divider: true },
  { id: 'emoji', label: 'Emoji', emoji: '🙂' },
  { id: 'mention', label: 'Mention someone', mention: true },
] as const

export function Composer({
  candidates,
  quoting,
  onDismissQuote,
  onSend,
  disabled = false,
  sending = false,
}: ComposerProps) {
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  /** Which `@fragment` the caret sits in, or null when the dropdown should be closed. */
  const [mentionQuery, setMentionQuery] = useState<MentionQuery | null>(null)
  /**
   * Highlighted row in the dropdown.
   *
   * Stored together with the term it belongs to, so a new term resets the highlight *during render*
   * rather than from an effect. The alternative — an effect watching the term — is a `setState` in
   * an effect body, which cascades a render for a value the render already knows.
   */
  const [highlight, setHighlight] = useState<{ term: string; index: number }>({
    term: '',
    index: 0,
  })

  const matches = useMemo(
    () => (mentionQuery === null ? [] : filterCandidates(candidates, mentionQuery.term)),
    [candidates, mentionQuery],
  )

  const term = mentionQuery?.term ?? ''
  // Falls back to the first row whenever the term changed, without touching state during render.
  const activeIndex = highlight.term === term ? highlight.index : 0

  const setActiveIndex = (index: number) => {
    setHighlight({ term, index })
  }

  const dropdownOpen = mentionQuery !== null && matches.length > 0

  /** Recomputes the dropdown state from the textarea's own value and selection. */
  const syncMention = (nextValue: string, caret: number) => {
    setValue(nextValue)
    setMentionQuery(findMentionQuery(nextValue, caret))
  }

  const applyEdit = (next: string, caret: number) => {
    syncMention(next, caret)

    // The caret has to be restored after React has applied the new value, or the browser puts it at
    // the end of the text and typing continues in the wrong place.
    queueMicrotask(() => {
      const element = textareaRef.current

      if (element !== null) {
        element.focus()
        element.setSelectionRange(caret, caret)
      }
    })
  }

  const insertMarker = (action: (typeof TOOLBAR)[number]) => {
    const element = textareaRef.current
    const start = element?.selectionStart ?? value.length
    const end = element?.selectionEnd ?? value.length

    if ('wrap' in action && action.wrap) {
      const selected = value.slice(start, end)
      const inner = selected === '' ? action.wrapText : selected

      applyEdit(
        `${value.slice(0, start)}${action.marker}${inner}${action.marker}${value.slice(end)}`,
        start + action.marker.length + inner.length + action.marker.length,
      )
      return
    }

    if ('prefix' in action && action.prefix !== undefined) {
      // Line-start insertion: a list marker only means anything at the beginning of a line.
      const lineStart = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1

      applyEdit(
        `${value.slice(0, lineStart)}${action.prefix}${value.slice(lineStart)}`,
        start + action.prefix.length,
      )
      return
    }

    if ('emoji' in action && action.emoji !== undefined) {
      applyEdit(
        `${value.slice(0, start)}${action.emoji}${value.slice(end)}`,
        start + action.emoji.length,
      )
      return
    }

    if ('mention' in action && action.mention) {
      // Opening the dropdown by text means the same code path as typing `@`, so there is exactly
      // one way the dropdown can appear.
      applyEdit(`${value.slice(0, start)}@${value.slice(end)}`, start + 1)
    }
  }

  const acceptMention = (candidate: MentionCandidate) => {
    if (mentionQuery === null) {
      return
    }

    const insertion = insertMention(value, mentionQuery, candidate, formatMention)

    setMentionQuery(null)
    applyEdit(insertion.text, insertion.caret)
  }

  const submit = () => {
    const body = value.trim()

    if (body === '' || disabled || sending) {
      return
    }

    onSend(body)
    setValue('')
    setMentionQuery(null)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (dropdownOpen) {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setActiveIndex((activeIndex + 1) % matches.length)
        return
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setActiveIndex((activeIndex - 1 + matches.length) % matches.length)
        return
      }

      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault()
        const candidate = matches[activeIndex]

        if (candidate !== undefined) {
          acceptMention(candidate)
        }

        return
      }

      if (event.key === 'Escape') {
        event.preventDefault()
        setMentionQuery(null)
        return
      }
    }

    // Enter sends; Shift+Enter is a newline. Stated in the placeholder so it is discoverable.
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      submit()
    }
  }

  return (
    <div className="relative shrink-0 px-5 pt-2.5 pb-4">
      {quoting !== null && <QuoteCard quote={quoting} onDismiss={onDismissQuote} />}

      {dropdownOpen && (
        <MentionDropdown
          candidates={matches}
          activeIndex={activeIndex}
          onPick={acceptMention}
          onHover={setActiveIndex}
        />
      )}

      <div className="rounded-control border-hairline bg-card flex flex-col gap-2 border p-2.5">
        <textarea
          ref={textareaRef}
          value={value}
          rows={1}
          disabled={disabled}
          onChange={(event) => {
            syncMention(event.target.value, event.target.selectionStart)
          }}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            // Delayed so a click on a dropdown row lands before the list unmounts.
            setTimeout(() => {
              setMentionQuery(null)
            }, 120)
          }}
          aria-label="Message"
          placeholder="Write a message…  **bold**  *italic*  - list   @ to mention   Enter to send"
          /*
            `field-sizing-content` grows the textarea with its content up to the max height, which
            is what the design's expanding composer does — without a JS resize observer.
          */
          className="text-content placeholder:text-content-muted field-sizing-content max-h-[160px] w-full resize-none bg-transparent text-[15px] leading-[1.6] outline-none disabled:opacity-50"
        />

        <div className="flex items-center gap-1">
          {TOOLBAR.map((action) =>
            'divider' in action ? (
              <span key={action.id} className="bg-hairline mx-1 h-4 w-px" />
            ) : (
              <button
                key={action.id}
                type="button"
                title={action.label}
                aria-label={action.label}
                onClick={() => {
                  insertMarker(action)
                }}
                className="rounded-control text-content-muted hover:bg-card-2 hover:text-content flex h-[30px] w-[30px] items-center justify-center transition-colors"
              >
                <ToolbarGlyph id={action.id} />
              </button>
            ),
          )}

          <button
            type="button"
            onClick={submit}
            disabled={value.trim() === '' || disabled || sending}
            className="rounded-control bg-outgoing text-outgoing-ink ml-auto px-4 py-1.5 text-[13px] font-medium transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
          >
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  )
}

/** The card the design pins above the input while a quote is being prepared. */
function QuoteCard({
  quote,
  onDismiss,
}: {
  quote: { senderDisplayName: string; bodyExcerpt: string }
  onDismiss: () => void
}) {
  return (
    <div
      data-testid="composer-quote"
      className="border-hairline bg-card-2 mb-2 flex items-center gap-2.5 rounded-[8px] border p-2.5"
    >
      <span aria-hidden className="bg-outgoing h-5 w-0.5 shrink-0 rounded-full" />
      <span className="text-content-muted min-w-0 flex-1 truncate text-[13px] leading-[1.6]">
        <span className="text-content font-medium">{quote.senderDisplayName}: </span>
        {quote.bodyExcerpt}
      </span>
      <button
        type="button"
        aria-label="Cancel quote"
        title="Cancel quote"
        onClick={onDismiss}
        className="text-content-muted hover:bg-highlight-2/40 hover:text-content flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px]"
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path
            d="m4 4 8 8M12 4l-8 8"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  )
}

/**
 * The mention dropdown, from the design's second frame.
 *
 * Each row is an avatar plus a name/title column, and the title comes from `User.title` — which is
 * why that field was added to the model rather than being invented in the client.
 */
function MentionDropdown({
  candidates,
  activeIndex,
  onPick,
  onHover,
}: {
  candidates: MentionCandidate[]
  activeIndex: number
  onPick: (candidate: MentionCandidate) => void
  onHover: (index: number) => void
}) {
  return (
    <div
      role="listbox"
      aria-label="Mention someone"
      data-testid="mention-dropdown"
      className="bg-popover ring-hairline absolute bottom-[calc(100%-6px)] left-5 z-10 max-h-[240px] w-[260px] overflow-y-auto rounded-[6px] py-2.5 shadow-lg ring-1"
    >
      {candidates.map((candidate, index) => (
        <button
          key={candidate.id}
          type="button"
          role="option"
          aria-selected={index === activeIndex}
          onMouseEnter={() => {
            onHover(index)
          }}
          // `onMouseDown` rather than `onClick`: the textarea's blur would otherwise close the
          // dropdown before a click could land.
          onMouseDown={(event) => {
            event.preventDefault()
            onPick(candidate)
          }}
          className={`flex w-full items-center gap-2.5 px-2.5 py-1.5 text-left ${
            index === activeIndex ? 'bg-highlight-2/50' : ''
          }`}
        >
          <Avatar user={candidate} size="sm" />
          <span className="flex min-w-0 flex-col">
            <span className="text-content truncate text-[12px]">{candidate.displayName}</span>
            {candidate.title !== null && (
              <span className="text-content-muted truncate text-[10px]">{candidate.title}</span>
            )}
          </span>
        </button>
      ))}
    </div>
  )
}

/** Small inline glyphs, drawn to a 16px box like the shell's. */

/** Small inline glyphs, drawn to a 16px box like the shell's. */
function ToolbarGlyph({ id }: { id: string }) {
  switch (id) {
    case 'bold':
      return (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path
            d="M5 3.5h3.2a2.5 2.5 0 0 1 0 5H5v-5Zm0 5h3.7a2.5 2.5 0 0 1 0 5H5v-5Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
      )
    case 'italic':
      return (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path
            d="M7 3.5h5M4 12.5h5M9.5 3.5l-3 9"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      )
    case 'strike':
      return (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path d="M3.5 8h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <path
            d="M11 5.2C10.5 4.2 9.4 3.6 8 3.6c-2 0-3 .9-3 2 0 1.4 1.6 1.9 3.4 2.4m2.6 2.1c-.4 1-1.5 1.6-3 1.6-1.6 0-2.8-.6-3.3-1.7"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
      )
    case 'ordered':
      return (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path
            d="M6.5 4.5h7M6.5 8h7M6.5 11.5h7"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <path
            d="M2.6 3.4h1v3.1M2.4 6.5h1.4M2.4 10.2c0-.5.4-.9 1-.9.5 0 .9.3.9.8 0 .9-1.9 1-1.9 2.4h2"
            stroke="currentColor"
            strokeWidth="1"
            strokeLinecap="round"
          />
        </svg>
      )
    case 'bullet':
      return (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path
            d="M6.5 4.5h7M6.5 8h7M6.5 11.5h7"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <circle cx="3.2" cy="4.5" r="1" fill="currentColor" />
          <circle cx="3.2" cy="8" r="1" fill="currentColor" />
          <circle cx="3.2" cy="11.5" r="1" fill="currentColor" />
        </svg>
      )
    case 'emoji':
      return (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
          <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="6" cy="6.8" r="0.9" fill="currentColor" />
          <circle cx="10" cy="6.8" r="0.9" fill="currentColor" />
          <path
            d="M5.8 9.6a2.6 2.6 0 0 0 4.4 0"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
      )
    case 'mention':
      return (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
          <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.5" />
          <path
            d="M11 8v1.2a1.8 1.8 0 0 0 3.1 1.1A6 6 0 1 0 10.6 13"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      )
    default:
      return null
  }
}
