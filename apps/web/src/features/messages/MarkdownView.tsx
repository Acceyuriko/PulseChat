import type { ReactNode } from 'react'

import { type MarkdownBlockNode, type MarkdownInlineNode, parseMarkdown } from './markdown'
import type { MentionLookup } from './mentions'

/**
 * Renders the markdown subset as React nodes.
 *
 * This is P2's payload, and the reason there is no sanitizer in the project. Every text node goes
 * through React's own escaping, no attribute is ever built from user input except a mention's
 * `data-user-id` (an opaque id we validated on the server) and a link's `href` (which the parser
 * only ever produces for `http(s)://`). There is no `dangerouslySetInnerHTML` on this path, so the
 * XSS class is absent rather than mitigated.
 *
 * A consequence worth stating: `MarkdownInlineNode` has no raw-HTML variant, so a future contributor
 * cannot add one by accident — they would have to change the parser's type first.
 */

export interface MarkdownProps {
  source: string
  /**
   * Used to mark a mention of the viewer. Passing `null` renders mentions as plain `@Name`, which is
   * what the conversation-list preview and the accessibility label want.
   */
  viewerId?: string | null
  /**
   * Extra context a mention needs from outside the message body. The renderer is deliberately
   * unaware of the conversation, so the caller supplies this.
   */
  lookup?: MentionLookup
}

/** Renders a full body: blocks, paragraph spacing, and lists. */
export function Markdown({ source, viewerId = null, lookup }: MarkdownProps) {
  const blocks = parseMarkdown(source)

  if (blocks.length === 0) {
    return null
  }

  return <>{blocks.map((block, index) => renderBlock(block, index, viewerId, lookup))}</>
}

function renderBlock(
  block: MarkdownBlockNode,
  key: number,
  viewerId: string | null,
  lookup: MentionLookup | undefined,
): ReactNode {
  if (block.type === 'paragraph') {
    return (
      <p key={key} className="text-[15px] leading-[1.6] break-words whitespace-pre-wrap">
        {renderInline(block.children, viewerId, lookup)}
      </p>
    )
  }

  const List = block.ordered ? 'ol' : 'ul'

  return (
    <List
      key={key}
      className={`my-1 flex flex-col gap-0.5 pl-5 text-[15px] leading-[1.6] ${
        block.ordered ? 'list-decimal' : 'list-disc'
      }`}
    >
      {block.items.map((item, index) => (
        <li key={index}>{renderInline(item, viewerId, lookup)}</li>
      ))}
    </List>
  )
}

function renderInline(
  nodes: MarkdownInlineNode[],
  viewerId: string | null,
  lookup: MentionLookup | undefined,
): ReactNode {
  return nodes.map((node, index) => {
    switch (node.type) {
      case 'text':
        return <span key={index}>{node.value}</span>

      case 'strong':
        return (
          <strong key={index} className="font-semibold">
            {renderInline(node.children, viewerId, lookup)}
          </strong>
        )

      case 'emphasis':
        return <em key={index}>{renderInline(node.children, viewerId, lookup)}</em>

      case 'strikethrough':
        return <s key={index}>{renderInline(node.children, viewerId, lookup)}</s>

      case 'mention': {
        // A mention of the viewer is tinted, which is the whole point of mentioning someone: the
        // message should catch their eye when they scroll back to it.
        const isViewer = viewerId !== null && node.userId === viewerId
        const known = lookup?.resolve(node.userId)

        return (
          <span
            key={index}
            data-mention-id={node.userId}
            className={
              isViewer
                ? 'bg-outgoing/20 text-outgoing rounded-[3px] px-0.5 font-medium'
                : 'text-content rounded-[3px] px-0.5 font-medium'
            }
            title={known?.title ?? undefined}
          >
            @{node.displayName}
          </span>
        )
      }

      case 'link':
        /**
         * `target="_blank"` with `rel="noreferrer noopener"`: without the `rel`, the opened page
         * gets a live `window.opener` handle back into this app.
         */
        return (
          <a
            key={index}
            href={node.href}
            target="_blank"
            rel="noreferrer noopener"
            className="text-outgoing underline underline-offset-2"
          >
            {renderInline(node.children, viewerId, lookup)}
          </a>
        )
    }
  })
}
