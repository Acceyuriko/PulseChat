export const IDENTITY_STORAGE_KEY = 'pulsechat:userId'

/**
 * The fake login keeps the selected identity in `localStorage` so a reload does not log you out.
 * The storage argument is injectable so this module stays testable without a DOM.
 */
export function readStoredUserId(storage: Storage = localStorage): string | null {
  const stored = storage.getItem(IDENTITY_STORAGE_KEY)

  if (stored === null) {
    return null
  }

  const trimmed = stored.trim()
  return trimmed === '' ? null : trimmed
}

export function writeStoredUserId(userId: string | null, storage: Storage = localStorage): void {
  if (userId === null) {
    storage.removeItem(IDENTITY_STORAGE_KEY)
    return
  }

  storage.setItem(IDENTITY_STORAGE_KEY, userId)
}
