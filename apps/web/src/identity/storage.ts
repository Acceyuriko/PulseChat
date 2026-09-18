export const IDENTITY_STORAGE_KEY = 'pulsechat:userId'

/**
 * The fake login keeps the selected identity in **`sessionStorage`**, not `localStorage`
 * (docs/plans/chat-features.md, P9).
 *
 * `localStorage` is shared across every tab of an origin, so two tabs could never be two different
 * users — which removes the "receiver" from a single-machine demo entirely. `sessionStorage` gives
 * each tab its own identity: reload keeps it, a fresh tab asks again. That trade is the whole point.
 *
 * The storage argument is injectable so this module stays testable without a DOM.
 */
export function readStoredUserId(storage: Storage = sessionStorage): string | null {
  const stored = storage.getItem(IDENTITY_STORAGE_KEY)

  if (stored === null) {
    return null
  }

  const trimmed = stored.trim()
  return trimmed === '' ? null : trimmed
}

export function writeStoredUserId(userId: string | null, storage: Storage = sessionStorage): void {
  if (userId === null) {
    storage.removeItem(IDENTITY_STORAGE_KEY)
    return
  }

  storage.setItem(IDENTITY_STORAGE_KEY, userId)
}
