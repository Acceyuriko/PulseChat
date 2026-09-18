import { describe, expect, it } from 'vitest'

import { QUOTE_EXCERPT_MAX_LENGTH } from '@pulsechat/shared/markdown'

import { buildExcerpt, buildQuoteSnapshot, collapseWhitespace, isQuotable } from '../quote.js'

const createdAt = new Date('2026-09-01T10:00:00.000Z')

describe('collapseWhitespace', () => {
  it('collapses newlines and runs of spaces to a single space', () => {
    expect(collapseWhitespace('a\n\n  b\t\tc ')).toBe('a b c')
  })
})

describe('buildExcerpt', () => {
  it('reduces markdown to plain text before cutting', () => {
    expect(buildExcerpt('**bold** and *italic*')).toBe('bold and italic')
  })

  it('resolves a mention to its label rather than leaking the link syntax', () => {
    expect(buildExcerpt('hi [@Devon Lane](mention:abc)')).toBe('hi @Devon Lane')
  })

  it('collapses a multi-paragraph body onto one line', () => {
    expect(buildExcerpt('first paragraph\n\nsecond paragraph')).toBe(
      'first paragraph second paragraph',
    )
  })

  it('appends an ellipsis only when it actually truncated', () => {
    const exact = 'x'.repeat(QUOTE_EXCERPT_MAX_LENGTH)

    expect(buildExcerpt(exact)).toBe(exact)
    expect(buildExcerpt(`${exact}y`)).toBe(`${exact}…`)
  })

  it('honours a custom maximum', () => {
    expect(buildExcerpt('abcdef', 3)).toBe('abc…')
  })

  /**
   * Codepoint-safe truncation. A naive `slice` can cut a surrogate pair in half and produce a
   * lone surrogate, which renders as a replacement character.
   */
  it('does not split a surrogate pair', () => {
    const excerpt = buildExcerpt('🫢🫢🫢', 2)

    expect(excerpt).toBe('🫢🫢…')
    expect(excerpt).not.toContain('\uFFFD')
  })

  it('returns an empty string for a body with no text', () => {
    expect(buildExcerpt('   \n  ')).toBe('')
  })
})

describe('buildQuoteSnapshot', () => {
  it('freezes the sender name and a plain-text excerpt', () => {
    const snapshot = buildQuoteSnapshot({
      id: 'message-1',
      senderId: 'user-2',
      senderDisplayName: 'Devon Lane',
      body: 'Check out **Vanilla Forums** — it is worth a look.',
      createdAt,
    })

    expect(snapshot).toEqual({
      messageId: 'message-1',
      senderId: 'user-2',
      senderDisplayName: 'Devon Lane',
      bodyExcerpt: 'Check out Vanilla Forums — it is worth a look.',
      createdAt,
    })
  })

  /**
   * The snapshot is a copy, not a reference. Mutating the source body afterwards must not reach
   * into the already-frozen excerpt — that is the whole point of freezing at send time.
   */
  it('is a copy, so later edits to the source do not reach it', () => {
    const source = {
      id: 'message-1',
      senderId: 'user-2',
      senderDisplayName: 'Devon Lane',
      body: 'original',
      createdAt,
    }

    const snapshot = buildQuoteSnapshot(source)
    source.body = 'edited afterwards'

    expect(snapshot.bodyExcerpt).toBe('original')
  })
})

describe('isQuotable', () => {
  it('accepts a live message', () => {
    expect(isQuotable({ deletedAt: null })).toBe(true)
    expect(isQuotable({})).toBe(true)
  })

  it('rejects a deleted message and a missing one', () => {
    expect(isQuotable({ deletedAt: createdAt })).toBe(false)
    expect(isQuotable(null)).toBe(false)
  })
})
