import { SOCKET_AUTH_USER_ID_KEY } from '@pulsechat/shared'

/**
 * Identity handling for the scaffold's fake login (docs/DECISIONS.md, D10).
 *
 * Both entry points reduce to "give me a user id or nothing": the HTTP header used by GraphQL, and
 * the socket.io handshake. Swapping this for real JWTs later means replacing this module and the
 * two call sites — no resolver, model or component has to change.
 */

export const IDENTITY_HEADER = 'x-user-id'

export type HeaderBag = Record<string, string | string[] | undefined>

function normaliseCandidate(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

/** Reads the identity from HTTP headers. Returns `null` when absent or blank. */
export function readIdentityHeader(headers: HeaderBag): string | null {
  const raw = headers[IDENTITY_HEADER]
  const value = Array.isArray(raw) ? raw[0] : raw

  return normaliseCandidate(value)
}

/** Reads the identity from the socket.io handshake (`io(url, { auth: { userId } })`). */
export function readSocketAuthUserId(auth: unknown): string | null {
  if (typeof auth !== 'object' || auth === null) {
    return null
  }

  return normaliseCandidate((auth as Record<string, unknown>)[SOCKET_AUTH_USER_ID_KEY])
}
