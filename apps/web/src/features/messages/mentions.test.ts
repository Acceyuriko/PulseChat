import { describe, expect, it } from 'vitest'

import {
  filterCandidates,
  findMentionQuery,
  insertMention,
  type MentionCandidate,
} from './mentions'

/** The designer's own example from the design's mention frame. */
const darrell: MentionCandidate = {
  id: 'u-darrell',
  displayName: 'Darrell Steward',
  title: 'CTO@Apple',
  avatarUrl: null,
}

const devon: MentionCandidate = {
  id: 'u-devon',
  displayName: 'Devon Lane',
  title: 'VP Engineering@Acme',
  avatarUrl: null,
}

const format = (displayName: string, userId: string) => `[@${displayName}](mention:${userId})`

describe('findMentionQuery', () => {
  it('finds an empty fragment right after the trigger', () => {
    expect(findMentionQuery('@', 1)).toEqual({ start: 0, end: 1, term: '' })
  })

  it('finds a partial term', () => {
    expect(findMentionQuery('@Darr', 5)).toEqual({ start: 0, end: 5, term: 'Darr' })
  })

  it('finds a fragment that starts after a space', () => {
    expect(findMentionQuery('hi @De', 6)).toEqual({ start: 3, end: 6, term: 'De' })
  })

  it('finds a fragment that starts after an opening bracket', () => {
    expect(findMentionQuery('(@De', 4)).toEqual({ start: 1, end: 4, term: 'De' })
  })

  it('returns null when there is no trigger', () => {
    expect(findMentionQuery('hello world', 11)).toBeNull()
  })

  it('ignores an @ in the middle of a word', () => {
    // `foo@bar` is an email address, not a mention.
    expect(findMentionQuery('foo@bar', 7)).toBeNull()
  })

  it('closes the fragment once whitespace is typed', () => {
    expect(findMentionQuery('@Darrell S', 10)).toBeNull()
  })

  it('closes the fragment at a newline', () => {
    expect(findMentionQuery('@Darrell\nnext', 13)).toBeNull()
  })

  it('only looks at text before the caret', () => {
    // The caret sitting before the `@` means no fragment, even though one exists later.
    expect(findMentionQuery('@De', 0)).toBeNull()
  })

  it('finds the innermost fragment when several exist', () => {
    expect(findMentionQuery('@a @De', 7)).toEqual({ start: 3, end: 7, term: 'De' })
  })
})

describe('filterCandidates', () => {
  const candidates = [darrell, devon]

  it('returns everyone for an empty term', () => {
    expect(filterCandidates(candidates, '')).toHaveLength(2)
  })

  it('matches case-insensitively', () => {
    expect(filterCandidates(candidates, 'darr')).toEqual([darrell])
  })

  it('matches a surname, not just the first name', () => {
    // People remember a surname far more reliably than the start of a name.
    expect(filterCandidates(candidates, 'Steward')).toEqual([darrell])
  })

  it('returns an empty list when nothing matches', () => {
    expect(filterCandidates(candidates, 'zzz')).toEqual([])
  })

  it('orders by where the match occurs', () => {
    // "e" appears in both names at different positions: DevOn's "Devon Lane" matches at index 1,
    // Darrell's "Steward" at index 9 — so the earlier match must come first.
    expect(filterCandidates(candidates, 'e').map((candidate) => candidate.displayName)).toEqual([
      'Devon Lane',
      'Darrell Steward',
    ])
  })

  it('breaks ties by leaving the original order alone', () => {
    // Both names begin with a "D", so the input order is preserved rather than shuffled.
    expect(filterCandidates(candidates, 'd').map((candidate) => candidate.displayName)).toEqual([
      'Darrell Steward',
      'Devon Lane',
    ])
  })

  it('does not mutate the input', () => {
    const input = [darrell, devon]
    filterCandidates(input, 'd')

    expect(input).toEqual([darrell, devon])
  })
})

describe('insertMention', () => {
  it('replaces the fragment with a mention link and a trailing space', () => {
    const query = findMentionQuery('@Darr', 5)
    const result = insertMention('@Darr', query!, darrell, format)

    expect(result.text).toBe('[@Darrell Steward](mention:u-darrell) ')
  })

  it('puts the caret after the inserted space', () => {
    const query = findMentionQuery('@Darr', 5)
    const result = insertMention('@Darr', query!, darrell, format)

    expect(result.caret).toBe(result.text.length)
  })

  it('the trailing space is what stops the dropdown reopening', () => {
    // Without the space the caret would still be inside a fragment, and the dropdown would
    // immediately match the mention that was just inserted.
    const query = findMentionQuery('@Darr', 5)
    const result = insertMention('@Darr', query!, darrell, format)

    expect(findMentionQuery(result.text, result.caret)).toBeNull()
  })

  it('preserves text before and after the fragment', () => {
    const text = 'please ask @De about it'
    const query = findMentionQuery(text, 14)
    const result = insertMention(text, query!, devon, format)

    expect(result.text).toBe('please ask [@Devon Lane](mention:u-devon)  about it')
  })

  it('handles an empty fragment', () => {
    const query = findMentionQuery('@', 1)
    const result = insertMention('@', query!, devon, format)

    expect(result.text).toBe('[@Devon Lane](mention:u-devon) ')
  })
})
