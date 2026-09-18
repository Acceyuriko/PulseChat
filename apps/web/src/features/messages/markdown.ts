import {
  BULLET_LIST_PREFIX,
  MARKDOWN_ESCAPE,
  MARKDOWN_MARKERS,
  MENTION_PATTERN,
  MENTION_SCHEME,
  ORDERED_LIST_PATTERN,
} from '@pulsechat/shared/markdown'

/**
 * The client-side markdown subset parser.
 *
 * The server has its own copy in `apps/api/src/domain/markdown.ts`, producing the same AST for the
 * seed previews and the quote excerpts. They are not shared code because they are consumed by
 * different runtimes and the *grammar* is what is shared — `@pulsechat/shared/markdown` declares the
 * markers, and both parsers obey them. Duplicating a ~150-line pure function across a process
 * boundary is a smaller sin than making the browser import from `node:fs`'s package graph
 * (docs/DECISIONS.md, D10).
 *
 * The output is a node tree, never a string of HTML. That is P2: there is no `innerHTML` anywhere on
 * this path, so the XSS class is removed rather than managed by a sanitizer. React escapes every
 * text node for us, and the only attribute we ever set is a controlled one.
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

export interface MarkdownMentionNode {
  type: 'mention'
  userId: string
  /** The display name as it was at send time. Rendered as-is; the id is what matters. */
  displayName: string
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

/**
 * Parses a body into blocks.
 *
 * Blocks are line-oriented: a blank line separates paragraphs, a run of `1. ` / `- ` lines becomes
 * one list. There is no nesting, no headings and no block quotes — the composer cannot produce them,
 * so the parser does not pretend to understand them.
 */
export function parseMarkdown(source: string): MarkdownBlockNode[] {
  const blocks: MarkdownBlockNode[] = []
  const lines = source.replace(/\r\n?/g, '\n').split('\n')

  let paragraph: string[] = []
  let list: MarkdownListNode | null = null

  const flushParagraph = () => {
    if (paragraph.length === 0) {
      return
    }

    const text = paragraph.join('\n')
    blocks.push({ type: 'paragraph', children: parseInline(text, 0, text.length) })
    paragraph = []
  }

  const flushList = () => {
    if (list !== null) {
      blocks.push(list)
      list = null
    }
  }

  for (const line of lines) {
    const trimmed = line.trim()

    if (trimmed === '') {
      flushParagraph()
      flushList()
      continue
    }

    const ordered = ORDERED_LIST_PATTERN.test(trimmed)
    const bullet = trimmed.startsWith(BULLET_LIST_PREFIX)

    if (ordered || bullet) {
      flushParagraph()

      const content = trimmed.replace(ordered ? ORDERED_LIST_PATTERN : BULLET_LIST_PREFIX, '')

      // A list interrupted by the other kind starts a new list rather than merging — otherwise a
      // bullet under an ordered list would be numbered by the browser as part of it.
      if (list === null || list.ordered !== ordered) {
        flushList()
        list = { type: 'list', ordered, items: [] }
      }

      list.items.push(parseInline(content, 0, content.length))
      continue
    }

    flushList()
    paragraph.push(trimmed)
  }

  flushParagraph()
  flushList()

  return blocks
}

/**
 * Scans inline content between `start` and `end`.
 *
 * `end` is clamped to the source length. That clamp is load-bearing: the only way out of this loop
 * is `index < end`, so an `end` beyond the string makes `source[index]` `undefined`, every branch
 * below fails, `plainEnd` computes to `index`, and `index` advances by one forever — an infinite
 * loop that pins a CPU core and produces no error. This exact bug hung the server's parser; see
 * `docs/DECISIONS.md`.
 */
function parseInline(source: string, start: number, end: number): MarkdownInlineNode[] {
  const nodes: MarkdownInlineNode[] = []
  let index = start
  const limit = Math.min(end, source.length)

  while (index < limit) {
    const character = source[index]

    /**
     * Longer markers are tested first, and each test compares the **whole marker string** against
     * the source at `index` rather than a single character against the marker. Those two are not
     * interchangeable: `MARKDOWN_MARKERS.bold` is `'**'`, so `source[index] === '**'` is never true
     * and the bold branch would be dead code that silently let `**bold**` parse as two empty
     * italics.
     */
    if (startsWith(source, MARKDOWN_MARKERS.bold, index, limit)) {
      const close = findClosing(source, MARKDOWN_MARKERS.bold, index + 2, limit)

      // `close > index + 2` refuses an empty span (`****`), which is not emphasis and whose markers
      // would otherwise vanish from the output.
      if (close > index + 2) {
        nodes.push({
          type: 'strong',
          children: parseInline(source, index + 2, close),
        })
        index = close + MARKDOWN_MARKERS.bold.length
        continue
      }
    }

    if (startsWith(source, MARKDOWN_MARKERS.strikethrough, index, limit)) {
      const close = findClosing(source, MARKDOWN_MARKERS.strikethrough, index + 2, limit)

      if (close > index + 2) {
        nodes.push({
          type: 'strikethrough',
          children: parseInline(source, index + 2, close),
        })
        index = close + MARKDOWN_MARKERS.strikethrough.length
        continue
      }
    }

    if (character === MARKDOWN_MARKERS.italic) {
      const close = findClosing(source, MARKDOWN_MARKERS.italic, index + 1, limit)

      /**
       * A `*` immediately followed by its partner is never emphasis. In `**unclosed` the bold
       * branch above fails (no closing `**`), and without this guard the italic branch would match
       * the second `*` as its closer and produce an *empty* emphasis node — silently swallowing
       * both characters. Requiring at least one character between the markers is what keeps the
       * degradation rule honest.
       */
      if (close !== -1 && close > index + 1) {
        nodes.push({
          type: 'emphasis',
          children: parseInline(source, index + 1, close),
        })
        index = close + MARKDOWN_MARKERS.italic.length
        continue
      }
    }

    // A mention is a link whose destination carries the `mention:` scheme.
    if (character === '[') {
      const mention = matchMention(source, index, limit)

      if (mention !== null) {
        nodes.push(mention.node)
        index = mention.next
        continue
      }

      const link = matchLink(source, index, limit)

      if (link !== null) {
        nodes.push(link.node)
        index = link.next
        continue
      }
    }

    if (character === MARKDOWN_ESCAPE && index + 1 < limit) {
      nodes.push({ type: 'text', value: source[index + 1] ?? '' })
      index += 2
      continue
    }

    /**
     * `findPlainTextEnd` stops *before* a marker character, so an unmatched marker would be stepped
     * over one character at a time and its characters dropped from the output entirely. That is the
     * wrong degradation: `**unclosed` must read as `**unclosed`, not as `unclosed`.
     *
     * So when none of the branches above claimed this position and the current character is itself
     * a marker, it is emitted as a literal and the scan advances past the *whole* marker.
     */
    const unmatchedMarker = unmatchedMarkerAt(source, index, limit)

    if (unmatchedMarker !== null) {
      nodes.push({ type: 'text', value: unmatchedMarker })
      index += unmatchedMarker.length
      continue
    }

    const plainEnd = findPlainTextEnd(source, index, limit)
    nodes.push({ type: 'text', value: source.slice(index, plainEnd) })
    index = plainEnd > index ? plainEnd : index + 1
  }

  return nodes
}

/**
 * The marker beginning at `index` when it has no closing partner, or null.
 *
 * Longest-first so `**unclosed` reports `**` rather than `*`: reporting the shorter one would leave
 * a second `*` to be handled on the next pass, and the two would still concatenate to the same text
 * — but the single-pass version is easier to reason about.
 */
function unmatchedMarkerAt(source: string, index: number, limit: number): string | null {
  for (const marker of [
    MARKDOWN_MARKERS.bold,
    MARKDOWN_MARKERS.strikethrough,
    MARKDOWN_MARKERS.italic,
  ]) {
    if (startsWith(source, marker, index, limit)) {
      return marker
    }
  }

  return null
}

/**
 * Whether `marker` occurs at exactly `index`, without running past `limit`.
 *
 * `String.prototype.startsWith` cannot express the bound, and slicing to compare would allocate on
 * every character of every message.
 */
function startsWith(source: string, marker: string, index: number, limit: number): boolean {
  return index + marker.length <= limit && source.startsWith(marker, index)
}

/** Finds the next occurrence of `marker` at or after `from`, or -1. */
function findClosing(source: string, marker: string, from: number, limit: number): number {
  const found = source.indexOf(marker, from)

  return found === -1 || found + marker.length > limit ? -1 : found
}

/** Consumes `[@Name](mention:id)` at `at`, or returns null. */
function matchMention(
  source: string,
  at: number,
  limit: number,
): { node: MarkdownMentionNode; next: number } | null {
  const rest = source.slice(at, limit)

  // Anchored at 0 so this only matches a mention starting exactly at `at`.
  const pattern = new RegExp(`^${MENTION_PATTERN.source}`)
  const match = pattern.exec(rest)

  if (match === null || match[1] === undefined || match[2] === undefined) {
    return null
  }

  return {
    node: { type: 'mention', displayName: match[1], userId: match[2] },
    next: at + match[0].length,
  }
}

/**
 * Consumes `[label](href)` — but only for http(s) destinations.
 *
 * `javascript:` and `data:` URLs are refused here rather than filtered at render time: a link node
 * that cannot be constructed cannot be rendered by mistake, which is the same reasoning as refusing
 * to build an HTML string at all.
 */
function matchLink(
  source: string,
  at: number,
  limit: number,
): { node: MarkdownLinkNode; next: number } | null {
  const rest = source.slice(at, limit)
  const match = /^\[([^\]]+)\]\(([^)\s]+)\)/.exec(rest)

  const label = match?.[1]
  const href = match?.[2]

  if (match === null || label === undefined || href === undefined) {
    return null
  }

  if (href.startsWith(MENTION_SCHEME) || !/^https?:\/\//i.test(href)) {
    return null
  }

  return {
    node: { type: 'link', href, children: [{ type: 'text', value: label }] },
    next: at + match[0].length,
  }
}

/**
 * How far the run of characters with no special meaning extends.
 *
 * The stop set is "anything that could begin a marker", not "anything that *does* begin a valid
 * one". Testing validity here would duplicate the branch logic above and, worse, would make the
 * scan re-enter on the same character with no progress.
 *
 * `from + 1` is the floor for a zero-length result: the caller treats a non-advancing return as
 * "step one character", but returning it explicitly keeps that guarantee inside this function where
 * it can be reasoned about.
 */
function findPlainTextEnd(source: string, from: number, limit: number): number {
  let index = from

  while (index < limit) {
    const character = source[index]

    if (
      character === MARKDOWN_MARKERS.italic ||
      character === MARKDOWN_MARKERS.strikethrough[0] ||
      character === '[' ||
      character === MARKDOWN_ESCAPE
    ) {
      break
    }

    index += 1
  }

  return index === from ? from + 1 : index
}

/**
 * The plain text of a body, for previews and accessible labels.
 *
 * Exported because the composer's mention detection and any future search both need "the text as a
 * human would read it", and a second implementation of that is a second thing to keep in sync.
 */
export function toPlainText(source: string): string {
  return parseMarkdown(source)
    .map((block) =>
      block.type === 'paragraph'
        ? inlineToString(block.children)
        : block.items.map((item) => inlineToString(item)).join('\n'),
    )
    .join('\n')
}

function inlineToString(nodes: MarkdownInlineNode[]): string {
  return nodes.map(nodeToString).join('')
}

function nodeToString(node: MarkdownInlineNode): string {
  switch (node.type) {
    case 'text':
      return node.value
    case 'mention':
      return `@${node.displayName}`
    case 'link':
      return inlineToString(node.children)
    default:
      return inlineToString(node.children)
  }
}
