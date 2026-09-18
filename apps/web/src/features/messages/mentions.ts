import { MENTION_TRIGGER } from '@pulsechat/shared/markdown'

/**
 * Mention candidate selection and the text edits that insert one.
 *
 * All of this is pure string and array work on purpose: the dropdown's behaviour is the kind of
 * thing that is tedious to drive through a DOM and trivial to test directly, and the composer's
 * value stays a plain string so nothing has to be kept in sync with a rich-text model.
 */

export interface MentionCandidate {
  id: string
  displayName: string
  title: string | null
  avatarUrl: string | null
}

export interface MentionLookup {
  resolve: (userId: string) => MentionCandidate | undefined
}

/** A `@fragment` the caret is currently sitting in. */
export interface MentionQuery {
  /** Index of the `@` that opened the fragment. */
  start: number
  /** Where the caret is, i.e. where the fragment ends. */
  end: number
  /** What has been typed after the `@`. May be empty. */
  term: string
}

/**
 * The `@fragment` immediately before the caret, or null.
 *
 * Two rules keep this from firing where it should not:
 *
 *  - the `@` must start a word — `foo@bar` is an email, not a mention;
 *  - the fragment must not contain whitespace, so typing a space closes the dropdown rather than
 *    leaving it open while the user writes an unrelated sentence.
 *
 * A newline also ends the fragment, since the composer is a textarea.
 */
export function findMentionQuery(text: string, caret: number): MentionQuery | null {
  const before = text.slice(0, caret)
  const at = before.lastIndexOf(MENTION_TRIGGER)

  if (at === -1) {
    return null
  }

  const term = before.slice(at + MENTION_TRIGGER.length)

  if (/[\s]/.test(term)) {
    return null
  }

  // `foo@bar`: the character before the `@` decides whether this is a word start.
  const preceding = at === 0 ? '' : (before[at - 1] ?? '')

  if (preceding !== '' && !/[\s(]/.test(preceding)) {
    return null
  }

  return { start: at, end: caret, term }
}

/**
 * Filters the mention dropdown's candidates.
 *
 * Case-insensitive substring match rather than prefix-only: people remember a surname or a middle
 * word ("Steward" for "Darrell Steward") far more reliably than they remember the start of a name.
 * Sorted by position of the match so the most relevant candidate is first and the list does not
 * reorder unpredictably between keystrokes.
 */
export function filterCandidates(candidates: MentionCandidate[], term: string): MentionCandidate[] {
  const needle = term.trim().toLowerCase()

  if (needle === '') {
    return candidates
  }

  return candidates
    .map((candidate) => ({ candidate, at: candidate.displayName.toLowerCase().indexOf(needle) }))
    .filter((entry) => entry.at !== -1)
    .sort((left, right) => left.at - right.at)
    .map((entry) => entry.candidate)
}

export interface MentionInsertion {
  /** The new composer value. */
  text: string
  /** Where the caret should land, so the user can keep typing. */
  caret: number
}

/**
 * Replaces the in-progress `@fragment` with a complete mention link plus a trailing space.
 *
 * The trailing space matters: without it the dropdown reopens immediately, matching the mention that
 * was just inserted, because the caret is still inside a `@fragment`.
 *
 * `formatMention` comes from the shared grammar so the text written here is byte-identical to what
 * the seed data produces and what the parser expects.
 */
export function insertMention(
  text: string,
  query: MentionQuery,
  candidate: MentionCandidate,
  format: (displayName: string, userId: string) => string,
): MentionInsertion {
  const before = text.slice(0, query.start)
  const after = text.slice(query.end)
  const mention = `${format(candidate.displayName, candidate.id)} `
  const nextText = `${before}${mention}${after}`

  return { text: nextText, caret: before.length + mention.length }
}
