import { describe, expect, it } from 'vitest'

import {
  type MarkdownBlockNode,
  type MarkdownInlineNode,
  parseMarkdown,
  toPlainText,
} from './markdown'

/** Every link node anywhere in the tree — the thing an unsafe URL would have to appear as. */
function collectLinks(blocks: MarkdownBlockNode[]): { href: string }[] {
  const found: { href: string }[] = []

  const walk = (nodes: MarkdownInlineNode[]) => {
    for (const node of nodes) {
      if (node.type === 'link') {
        found.push({ href: node.href })
      }

      if ('children' in node) {
        walk(node.children)
      }
    }
  }

  for (const block of blocks) {
    if (block.type === 'paragraph') {
      walk(block.children)
    } else {
      block.items.forEach(walk)
    }
  }

  return found
}

/** Text as rendered, used where the node split is irrelevant and only the characters matter. */
function plainTextOf(source: string): string {
  return toPlainText(source)
}

/**
 * The client parser.
 *
 * Beyond the grammar itself, two kinds of case are asserted here on purpose:
 *
 *  - **Termination.** The server's copy of this parser shipped with an `Infinity` bound and hung a
 *    CPU core on every plain paragraph. Every shape that reaches the scanner gets a test, so the
 *    same regression cannot return silently.
 *  - **Refusal.** Anything the AST cannot represent safely (`javascript:` links, an unclosed marker)
 *    must degrade to visible text rather than to a broken node.
 */

describe('parseMarkdown blocks', () => {
  it('parses a single paragraph', () => {
    expect(parseMarkdown('hello world')).toEqual([
      { type: 'paragraph', children: [{ type: 'text', value: 'hello world' }] },
    ])
  })

  it('separates paragraphs on a blank line', () => {
    const blocks = parseMarkdown('first\n\nsecond')

    expect(blocks).toHaveLength(2)
    expect(blocks.every((block) => block.type === 'paragraph')).toBe(true)
  })

  it('keeps a single newline inside one paragraph', () => {
    const blocks = parseMarkdown('line one\nline two')

    expect(blocks).toHaveLength(1)
    expect(toPlainText('line one\nline two')).toBe('line one\nline two')
  })

  it('parses a bullet list', () => {
    const blocks = parseMarkdown('- one\n- two')

    expect(blocks).toEqual([
      {
        type: 'list',
        ordered: false,
        items: [[{ type: 'text', value: 'one' }], [{ type: 'text', value: 'two' }]],
      },
    ])
  })

  it('parses an ordered list', () => {
    const blocks = parseMarkdown('1. first\n2. second')

    expect(blocks[0]).toMatchObject({ type: 'list', ordered: true })
    expect(blocks[0]?.type === 'list' && blocks[0].items).toHaveLength(2)
  })

  it('starts a new list when the kind changes mid-run', () => {
    // `1. a` followed by `- b` is two lists. Merging them would make the browser number the bullet.
    const blocks = parseMarkdown('1. a\n- b')

    expect(blocks).toHaveLength(2)
    expect(blocks[0]).toMatchObject({ ordered: true })
    expect(blocks[1]).toMatchObject({ ordered: false })
  })

  it('treats the empty string as no blocks', () => {
    expect(parseMarkdown('')).toEqual([])
  })

  it('treats whitespace-only input as no blocks', () => {
    expect(parseMarkdown('   \n\n  \t ')).toEqual([])
  })

  it('normalises CRLF line endings', () => {
    expect(parseMarkdown('a\r\n\r\nb')).toHaveLength(2)
  })
})

describe('parseMarkdown inline', () => {
  it('parses bold', () => {
    expect(parseMarkdown('**bold**')).toEqual([
      {
        type: 'paragraph',
        children: [
          {
            type: 'strong',
            children: [{ type: 'text', value: 'bold' }],
          },
        ],
      },
    ])
  })

  it('parses italic', () => {
    expect(parseMarkdown('*italic*')[0]).toMatchObject({
      children: [{ type: 'emphasis', children: [{ type: 'text', value: 'italic' }] }],
    })
  })

  it('parses strikethrough', () => {
    expect(parseMarkdown('~~gone~~')[0]).toMatchObject({
      children: [{ type: 'strikethrough', children: [{ type: 'text', value: 'gone' }] }],
    })
  })

  it('prefers bold over italic for a double asterisk', () => {
    // `**x**` must not parse as an empty italic wrapping a stray `x`.
    const children = parseMarkdown('**x**')[0]

    expect(children).toMatchObject({ children: [{ type: 'strong' }] })
  })

  it('parses bold mixed with surrounding text', () => {
    expect(parseMarkdown('a **b** c')[0]).toMatchObject({
      children: [
        { type: 'text', value: 'a ' },
        { type: 'strong', children: [{ type: 'text', value: 'b' }] },
        { type: 'text', value: ' c' },
      ],
    })
  })

  it('leaves an unclosed marker as literal text', () => {
    // Degrading to text is the rule: silently dropping the characters would hide the user's input.
    expect(toPlainText('**unclosed')).toBe('**unclosed')
  })

  it('leaves an unclosed italic marker as literal text', () => {
    expect(toPlainText('*unclosed')).toBe('*unclosed')
  })

  it('leaves an unclosed strikethrough marker as literal text', () => {
    expect(toPlainText('~~unclosed')).toBe('~~unclosed')
  })

  it('treats a lone asterisk as text', () => {
    expect(toPlainText('2 * 3 = 6')).toBe('2 * 3 = 6')
  })

  it('honours a backslash escape', () => {
    expect(toPlainText('\\*not italic\\*')).toBe('*not italic*')
  })

  it('parses a mention into its id and display name', () => {
    expect(parseMarkdown('[@Devon Lane](mention:abc123) hi')[0]).toMatchObject({
      children: [
        { type: 'mention', userId: 'abc123', displayName: 'Devon Lane' },
        { type: 'text', value: ' hi' },
      ],
    })
  })

  it('parses a link with an http destination', () => {
    expect(parseMarkdown('[docs](https://example.com)')[0]).toMatchObject({
      children: [
        {
          type: 'link',
          href: 'https://example.com',
          children: [{ type: 'text', value: 'docs' }],
        },
      ],
    })
  })

  it('refuses a javascript: destination and leaves it as literal text', () => {
    // The point is that no *link node* is produced, so the renderer never receives an href to
    // sanitise. The characters remain visible as text, which is the degradation rule.
    const nodes = parseMarkdown('[click](javascript:alert(1))')

    expect(plainTextOf('[click](javascript:alert(1))')).toBe('[click](javascript:alert(1))')
    expect(collectLinks(nodes)).toEqual([])
  })

  it('refuses a data: destination', () => {
    expect(collectLinks(parseMarkdown('[x](data:text/html,<script>1</script>)'))).toEqual([])
  })

  it('refuses a scheme-relative or bare destination', () => {
    expect(collectLinks(parseMarkdown('[x](/admin)'))).toEqual([])
    expect(collectLinks(parseMarkdown('[x](//evil.example)'))).toEqual([])
  })

  it('nests emphasis inside bold', () => {
    expect(parseMarkdown('**a *b* c**')[0]).toMatchObject({
      children: [
        {
          type: 'strong',
          children: [
            { type: 'text', value: 'a ' },
            { type: 'emphasis', children: [{ type: 'text', value: 'b' }] },
            { type: 'text', value: ' c' },
          ],
        },
      ],
    })
  })

  it('keeps a mention inside bold', () => {
    expect(parseMarkdown('**[@Devon Lane](mention:u1)**')[0]).toMatchObject({
      children: [
        {
          type: 'strong',
          children: [{ type: 'mention', userId: 'u1', displayName: 'Devon Lane' }],
        },
      ],
    })
  })
})

describe('parseMarkdown termination', () => {
  /**
   * Each of these hung the server's parser before the bound was clamped. They are cheap, so they
   * stay as a tripwire: a scanner that cannot terminate fails here instead of pinning a core.
   */
  const cases: [string, string][] = [
    ['a plain paragraph', 'hello'],
    ['a paragraph with a trailing marker', 'hello *'],
    ['a paragraph ending in a backslash', 'hello \\'],
    ['an opening bracket', 'hello ['],
    ['an unterminated link', '[label](ht'],
    ['an unterminated mention', '[@a](mention:'],
    ['only special characters', '**~~*[]\\'],
    ['a long plain run', 'x'.repeat(5000)],
    ['a list item', '- hello *'],
    ['mixed blocks', 'para\n\n- item\n\n1. one'],
  ]

  for (const [description, input] of cases) {
    it(`terminates on ${description}`, () => {
      // The assertion is that this returns at all; the value is incidental.
      expect(() => parseMarkdown(input)).not.toThrow()
      expect(toPlainText(input)).toBeTypeOf('string')
    })
  }
})

describe('toPlainText', () => {
  it('renders a mention as @Name', () => {
    expect(toPlainText('[@Devon Lane](mention:u1) ping')).toBe('@Devon Lane ping')
  })

  it('drops emphasis markers', () => {
    expect(toPlainText('**a** *b* ~~c~~')).toBe('a b c')
  })

  it('joins list items with newlines', () => {
    expect(toPlainText('- one\n- two')).toBe('one\ntwo')
  })

  it('keeps emoji intact', () => {
    expect(toPlainText('Yeah I know 🫢')).toBe('Yeah I know 🫢')
  })
})
