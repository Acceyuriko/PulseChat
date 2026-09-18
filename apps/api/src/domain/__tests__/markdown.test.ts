import { describe, expect, it } from 'vitest'

import {
  type MarkdownBlockNode,
  type MarkdownInlineNode,
  extractMentionedUserIds,
  parseMarkdown,
  parseToPlainText,
  toPlainText,
} from '../markdown.js'

/** Narrows to a paragraph so the tests can assert on the inline tree without a cast at every line. */
function paragraphAt(blocks: MarkdownBlockNode[], index = 0): MarkdownInlineNode[] {
  const block = blocks[index]

  if (block === undefined || block.type !== 'paragraph') {
    throw new Error(`Expected a paragraph at index ${index}`)
  }

  return block.children
}

describe('parseMarkdown — inline', () => {
  it('parses bold, italic and strikethrough', () => {
    expect(paragraphAt(parseMarkdown('**bold**'))).toEqual([
      { type: 'strong', children: [{ type: 'text', value: 'bold' }] },
    ])

    expect(paragraphAt(parseMarkdown('*italic*'))).toEqual([
      { type: 'emphasis', children: [{ type: 'text', value: 'italic' }] },
    ])

    expect(paragraphAt(parseMarkdown('~~gone~~'))).toEqual([
      { type: 'strikethrough', children: [{ type: 'text', value: 'gone' }] },
    ])
  })

  /**
   * The longest-first rule. Reading `**` as two `*` would produce `<em></em>bold**` — this is the
   * single most likely way for a hand-rolled parser to be wrong.
   */
  it('reads ** as bold rather than as two italics', () => {
    const nodes = paragraphAt(parseMarkdown('a **b** c'))

    expect(nodes).toEqual([
      { type: 'text', value: 'a ' },
      { type: 'strong', children: [{ type: 'text', value: 'b' }] },
      { type: 'text', value: ' c' },
    ])
  })

  it('merges adjacent text into one node', () => {
    const nodes = paragraphAt(parseMarkdown('plain text here'))

    expect(nodes).toEqual([{ type: 'text', value: 'plain text here' }])
  })

  it('keeps an unmatched marker as literal text', () => {
    expect(paragraphAt(parseMarkdown('2 * 3 = 6'))).toEqual([{ type: 'text', value: '2 * 3 = 6' }])
    expect(paragraphAt(parseMarkdown('**unclosed'))).toEqual([
      { type: 'text', value: '**unclosed' },
    ])
  })

  it('does not match across a newline', () => {
    // The opening `**` is on the first line and there is no closer, so it stays literal — a
    // half-typed message must not render as if it were finished.
    const [first] = parseMarkdown('**start\nsecond')

    expect(first).toEqual({
      type: 'paragraph',
      children: [{ type: 'text', value: '**start\nsecond' }],
    })
  })

  it('honours a backslash escape', () => {
    expect(paragraphAt(parseMarkdown('\\*not italic\\*'))).toEqual([
      { type: 'text', value: '*not italic*' },
    ])
  })

  it('autolinks a bare URL', () => {
    expect(paragraphAt(parseMarkdown('see https://example.com/docs for more'))).toEqual([
      { type: 'text', value: 'see ' },
      {
        type: 'link',
        href: 'https://example.com/docs',
        children: [{ type: 'text', value: 'https://example.com/docs' }],
      },
      { type: 'text', value: ' for more' },
    ])
  })
})

describe('parseMarkdown — mentions', () => {
  it('parses a mention as its own node carrying the id from the destination', () => {
    const nodes = paragraphAt(parseMarkdown('hi [@Devon Lane](mention:abc123) there'))

    expect(nodes).toEqual([
      { type: 'text', value: 'hi ' },
      {
        type: 'mention',
        userId: 'abc123',
        children: [{ type: 'text', value: '@Devon Lane' }],
      },
      { type: 'text', value: ' there' },
    ])
  })

  /**
   * Renaming is exactly why the label and the id are separate: the destination survives, so the
   * mention still points at the right person.
   */
  it('keeps the label and the id independent', () => {
    const [node] = paragraphAt(parseMarkdown('[@Old Name](mention:user-7)'))

    expect(node).toEqual({
      type: 'mention',
      userId: 'user-7',
      children: [{ type: 'text', value: '@Old Name' }],
    })
  })

  it('leaves a malformed mention as plain text', () => {
    expect(toPlainText(paragraphAt(parseMarkdown('[@broken](mention:no-close')))).toBe(
      '[@broken](mention:no-close',
    )
  })

  it('parses a non-mention link as a link', () => {
    expect(paragraphAt(parseMarkdown('[docs](https://example.com)'))).toEqual([
      {
        type: 'link',
        href: 'https://example.com',
        children: [{ type: 'text', value: 'docs' }],
      },
    ])
  })

  it('collects mentioned ids without duplicates and in order', () => {
    const body = '[@A](mention:1) and [@B](mention:2) and [@A](mention:1) again'

    expect(extractMentionedUserIds(body)).toEqual(['1', '2'])
  })

  it('returns no ids for a body without mentions', () => {
    expect(extractMentionedUserIds('just a plain **message**')).toEqual([])
  })
})

describe('parseMarkdown — blocks', () => {
  it('groups consecutive bullet items into one list', () => {
    const blocks = parseMarkdown('- one\n- two\n- three')

    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toEqual({
      type: 'list',
      ordered: false,
      items: [
        [{ type: 'text', value: 'one' }],
        [{ type: 'text', value: 'two' }],
        [{ type: 'text', value: 'three' }],
      ],
    })
  })

  it('groups consecutive ordered items into one ordered list', () => {
    const blocks = parseMarkdown('1. first\n2. second')

    expect(blocks).toEqual([
      {
        type: 'list',
        ordered: true,
        items: [[{ type: 'text', value: 'first' }], [{ type: 'text', value: 'second' }]],
      },
    ])
  })

  it('starts a new list when the kind changes', () => {
    const blocks = parseMarkdown('- bullet\n1. ordered')

    expect(blocks).toHaveLength(2)
    expect(blocks.map((block) => block.type === 'list' && block.ordered)).toEqual([false, true])
  })

  it('separates paragraphs on a blank line', () => {
    const blocks = parseMarkdown('first paragraph\n\nsecond paragraph')

    expect(blocks).toHaveLength(2)
    expect(toPlainText(paragraphAt(blocks, 0))).toBe('first paragraph')
    expect(toPlainText(paragraphAt(blocks, 1))).toBe('second paragraph')
  })

  it('keeps a single newline inside one paragraph', () => {
    const blocks = parseMarkdown('line one\nline two')

    expect(blocks).toHaveLength(1)
    expect(toPlainText(paragraphAt(blocks))).toBe('line one\nline two')
  })

  it('ends a list at a paragraph', () => {
    const blocks = parseMarkdown('- item\nafter the list')

    expect(blocks.map((block) => block.type)).toEqual(['list', 'paragraph'])
  })

  it('parses inline syntax inside a list item', () => {
    const blocks = parseMarkdown('- **bold** item')
    const list = blocks[0]

    expect(list?.type).toBe('list')
    expect(list?.type === 'list' ? list.items[0] : null).toEqual([
      { type: 'strong', children: [{ type: 'text', value: 'bold' }] },
      { type: 'text', value: ' item' },
    ])
  })

  /**
   * Item content is parsed within its own bounds, so a marker opened in one item cannot be closed
   * by text in the next one.
   */
  it('does not let an emphasis span two list items', () => {
    const blocks = parseMarkdown('- *open\n- close*')
    const list = blocks[0]
    const items = list?.type === 'list' ? list.items : []

    expect(items[0]).toEqual([{ type: 'text', value: '*open' }])
    expect(items[1]).toEqual([{ type: 'text', value: 'close*' }])
  })
})

describe('parseToPlainText', () => {
  it('strips markers and keeps mention labels readable', () => {
    expect(parseToPlainText('**hi** [@Grace](mention:1) ping')).toBe('hi @Grace ping')
  })

  it('flattens a list to one item per line', () => {
    expect(parseToPlainText('- one\n- two')).toBe('one\ntwo')
  })

  it('returns an empty string for an empty body', () => {
    expect(parseToPlainText('')).toBe('')
  })
})
