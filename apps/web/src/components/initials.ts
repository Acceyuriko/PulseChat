/**
 * Initials for a user with no avatar.
 *
 * Its own module rather than an export beside the `Avatar` component: Vite's fast refresh can only
 * hot-replace a module whose exports are *all* components, so a stray helper in a component file
 * means every edit there triggers a full reload.
 */

/** First letters of the first two words, which is what reads best at a 30px circle. */
export function initialsOf(displayName: string): string {
  const words = displayName
    .trim()
    .split(/\s+/)
    .filter((word) => word !== '')

  const first = words[0]

  if (first === undefined) {
    return '?'
  }

  const second = words[1]

  if (second === undefined) {
    return first.slice(0, 2).toUpperCase()
  }

  return `${first.slice(0, 1)}${second.slice(0, 1)}`.toUpperCase()
}
