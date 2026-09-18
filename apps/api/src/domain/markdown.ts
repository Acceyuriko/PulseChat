import { MENTION_PATTERN, MENTION_SCHEME } from '@pulsechat/shared/markdown'

/**
 * Parses a message body into blocks. Blank lines separate blocks; consecutive list items of the
 * same kind join into one list node.
 *
 * Implemented as a line scanner that hands each run of text to `parseInline`, which keeps the
 * block and inline grammars from having to know about each other.
 */

export interface MarkdownTextNode {
  type: 'text'
  value: string
}

export interface MarkdownStrongNode {
  type: 'strong'
  children: MarkdownInlineNode[]
}

export interface MarkdownEmphasisNode {
  type: 'emphasis'
  children: MarkdownInlineNode[]
}

export interface MarkdownStrikethroughNode {
  type: 'strikethrough'
  children: MarkdownInlineNode[]
}

/**
 * A mention. The `userId` comes from the link destination, so the label stays a display name and
 * nothing has to be rewritten when a user is renamed.
 */
export interface MarkdownMentionNode {
  type: 'mention'
  userId: string
  children: MarkdownInlineNode[]
}

export interface MarkdownLinkNode {
  type: 'link'
  href: string
  children: MarkdownInlineNode[]
}

export type MarkdownInlineNode =
  | MarkdownTextNode
  | MarkdownStrongNode
  | MarkdownEmphasisNode
  | MarkdownStrikethroughNode
  | MarkdownMentionNode
  | MarkdownLinkNode

export interface MarkdownParagraphNode {
  type: 'paragraph'
  children: MarkdownInlineNode[]
}

export interface MarkdownListNode {
  type: 'list'
  ordered: boolean
  items: MarkdownInlineNode[][]
}

export type MarkdownBlockNode = MarkdownParagraphNode | MarkdownListNode

/** Ordered list items look like `1. text`; bullet items like `- text`. */
const ORDERED_ITEM = /^(\d+)\.\s+(.*)$/
const BULLET_ITEM = /^-\s+(.*)$/

/** `http(s)://…`, stopping before trailing punctuation and closing brackets. */
const AUTOLINK_PATTERN = /^https?:\/\/[^\s<>()[\]]*/i

/**
 * Inline markers, longest first so `**bold**` is never read as an empty `*italic*` followed by
 * more text.
 */
const INLINE_MARKERS = [
  { token: '**', type: 'strong' as const },
  { token: '~~', type: 'strikethrough' as const },
  { token: '*', type: 'emphasis' as const },
]

/**
 * Finds the end of the run of plain text starting at `position`.
 *
 * A run stops at anything that could begin inline syntax, so the caller can decide whether it is
 * real syntax or just a character that has to be emitted literally.
 */
function findPlainTextEnd(source: string, position: number): number {
  let index = position

  while (index < source.length) {
    const character = source[index] ?? ''
    const isMarkerStart = INLINE_MARKERS.some((marker) => marker.token.startsWith(character))
    const isSyntaxStart =
      isMarkerStart || character === '\\' || character === '[' || /^[hH]$/.test(character)

    if (isSyntaxStart) {
      break
    }

    index += 1
  }

  return index
}

/**
 * Parses inline syntax over `source[start..end)`.
 *
 * `end` must be a real offset within `source`, never a sentinel like `Infinity`: the loop's only
 * exit is `index >= end`, and `source[index]` past the end is `undefined`, so an unbounded `end`
 * makes the scan spin forever appending empty text. Callers that want "to the end of the string"
 * pass `source.length` — see `inlineEnd` below.
 */
function parseInline(source: string, start: number, end: number): MarkdownInlineNode[] {
  const nodes: MarkdownInlineNode[] = []
  let index = start

  const limit = Math.min(end, source.length)

  const push = (node: MarkdownInlineNode): void => {
    const previous = nodes.at(-1)

    // Merge adjacent text so the tree (and the React keys built from it) stays shallow.
    if (node.type === 'text' && previous?.type === 'text') {
      previous.value += node.value
      return
    }

    nodes.push(node)
  }

  while (index < limit) {
    const character = source[index] ?? ''

    // A backslash escapes the next character, so `\*` is a literal asterisk.
    if (character === '\\' && index + 1 < limit) {
      push({ type: 'text', value: source[index + 1] ?? '' })
      index += 2
      continue
    }

    // `[label](destination)` — a mention when the destination uses the `mention:` scheme.
    if (character === '[') {
      const labelEnd = source.indexOf(']', index + 1)

      if (labelEnd !== -1 && labelEnd + 1 < limit && source[labelEnd + 1] === '(') {
        const destinationEnd = source.indexOf(')', labelEnd + 2)

        if (destinationEnd !== -1 && destinationEnd < limit) {
          const label = source.slice(index + 1, labelEnd)
          const destination = source.slice(labelEnd + 2, destinationEnd)
          const children = label === '' ? [] : [{ type: 'text' as const, value: label }]

          if (destination.startsWith(MENTION_SCHEME)) {
            push({
              type: 'mention',
              userId: destination.slice(MENTION_SCHEME.length),
              children,
            })
          } else {
            push({ type: 'link', href: destination, children })
          }

          index = destinationEnd + 1
          continue
        }
      }
    }

    // Inline emphasis family.
    const marker = INLINE_MARKERS.find((candidate) => source.startsWith(candidate.token, index))

    if (marker !== undefined) {
      const contentStart = index + marker.token.length
      const contentEnd = source.indexOf(marker.token, contentStart)

      // No closing delimiter, or an empty span: emit the marker as literal text. Guessing here is
      // what makes a half-typed message render as something the user did not write.
      if (contentEnd !== -1 && contentEnd < limit && contentEnd > contentStart) {
        push({
          type: marker.type,
          children: parseInline(source, contentStart, contentEnd),
        })
        index = contentEnd + marker.token.length
        continue
      }
    }

    // A bare URL becomes a link, which is what makes a pasted address clickable.
    if (character === 'h' || character === 'H') {
      const match = AUTOLINK_PATTERN.exec(source.slice(index, limit))

      if (match !== null && match[0].length > 0) {
        push({
          type: 'link',
          href: match[0],
          children: [{ type: 'text', value: match[0] }],
        })
        index += match[0].length
        continue
      }
    }

    const plainEnd = findPlainTextEnd(source, index)

    /**
     * `findPlainTextEnd` returns `index` when the character there could start syntax. The `+ 1`
     * is what guarantees progress, and it must stay: without it, an unconsumed syntax character
     * would spin here. `Math.min` keeps the emitted slice inside the bound when `index` is the
     * last character.
     */
    const next = Math.min(plainEnd > index ? plainEnd : index + 1, limit)

    push({ type: 'text', value: source.slice(index, next) })
    index = next
  }

  return nodes
}

export function parseMarkdown(source: string): MarkdownBlockNode[] {
  const blocks: MarkdownBlockNode[] = []
  const lines = source.split('\n')

  let paragraph: string[] = []
  let list: MarkdownListNode | null = null

  const flushParagraph = (): void => {
    if (paragraph.length === 0) {
      return
    }

    const text = paragraph.join('\n')

    // `text.length`, not `Infinity`: the inline scan is bounded by its `end` argument, and passing
    // an unbounded value is what makes it loop forever past the end of the string.
    blocks.push({ type: 'paragraph', children: parseInline(text, 0, text.length) })
    paragraph = []
  }

  const flushList = (): void => {
    if (list !== null) {
      blocks.push(list)
      list = null
    }
  }

  for (const line of lines) {
    const orderedMatch = ORDERED_ITEM.exec(line)
    const bulletMatch = orderedMatch === null ? BULLET_ITEM.exec(line) : null

    if (orderedMatch !== null || bulletMatch !== null) {
      flushParagraph()

      const ordered = orderedMatch !== null
      const content = ordered ? (orderedMatch[2] ?? '') : (bulletMatch?.[1] ?? '')
      // Offsets are *within the item content*, so the scan is bounded by its length: a marker that
      // opens in one list item can never be closed by text in the next one.
      const item = parseInline(content, 0, content.length)

      if (list !== null && list.ordered === ordered) {
        list.items.push(item)
      } else {
        flushList()
        list = { type: 'list', ordered, items: [item] }
      }

      continue
    }

    flushList()

    if (line.trim() === '') {
      flushParagraph()
      continue
    }

    paragraph.push(line)
  }

  flushList()
  flushParagraph()

  return blocks
}

/** The plain text of a parsed body, for previews, excerpts and accessibility labels. */
export function toPlainText(nodes: MarkdownInlineNode[]): string {
  return nodes
    .map((node) => {
      switch (node.type) {
        case 'text':
          return node.value
        case 'strong':
        case 'emphasis':
        case 'strikethrough':
        case 'mention':
        case 'link':
          return toPlainText(node.children)
      }
    })
    .join('')
}

/** The plain text of a whole body, blocks flattened with newlines preserved between paragraphs. */
export function parseToPlainText(source: string): string {
  return parseMarkdown(source)
    .map((block) => {
      if (block.type === 'paragraph') {
        return toPlainText(block.children)
      }

      return block.items.map((item) => toPlainText(item)).join('\n')
    })
    .join('\n')
}

/**
 * The ids mentioned anywhere in a body, in order of first appearance, without duplicates.
 *
 * Derived from the same text the renderer shows rather than from a stored `mentionIds` array: a
 * parallel array is a second source of truth that can disagree with the body.
 */
export function extractMentionedUserIds(source: string): string[] {
  const ids: string[] = []

  for (const match of source.matchAll(MENTION_PATTERN)) {
    const userId = match[2]?.trim()

    if (userId !== undefined && userId !== '' && !ids.includes(userId)) {
      ids.push(userId)
    }
  }

  return ids
}
