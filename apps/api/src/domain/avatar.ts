/**
 * Deterministic letter avatars (docs/plans/chat-features.md, module 39).
 *
 * Rendered locally as a data URI rather than fetched from an avatar service: the repo has to work
 * offline after a clone, and an external service would make every screenshot depend on the network.
 *
 * A data URI rather than an inline component so the avatar is a plain `<img src>` everywhere —
 * a real `avatarUrl` from real authentication slots into the same field with no component change.
 */

/** Initials: first letter of the first two words, which is what the design's avatars show. */
export function initialsOf(displayName: string): string {
  const words = displayName
    .trim()
    .split(/\s+/)
    .filter((word) => word !== '')

  const letters = words
    .slice(0, 2)
    .map((word) => Array.from(word)[0] ?? '')
    .join('')

  return letters.toUpperCase() === '' ? '?' : letters.toUpperCase()
}

/**
 * A stable hue per identity, derived from the name so the same person always gets the same colour
 * across reseeds and across machines.
 */
export function hueOf(seed: string): number {
  let hash = 0

  for (const character of seed) {
    hash = (hash * 31 + character.codePointAt(0)!) % 360
  }

  return hash
}

/**
 * A 64×64 SVG with the initials on a muted dark ground.
 *
 * The palette is fixed rather than tinted from the hue: the design is dark-only and the avatars sit
 * on `#1D1C21`, so a saturated fill would pull attention away from the unread badges. The hue only
 * varies the tint slightly, which is enough to tell people apart at 40px.
 */
export function letterAvatarDataUri(displayName: string): string {
  const initials = initialsOf(displayName)
  const hue = hueOf(displayName)
  const fill = `hsl(${hue} 22% 30%)`

  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">',
    `<rect width="64" height="64" rx="32" fill="${fill}"/>`,
    '<text x="32" y="32" dy="0.355em" text-anchor="middle" fill="#C9C7D0"',
    ' font-family="Inter, system-ui, sans-serif" font-size="26" font-weight="500">',
    initials,
    '</text>',
    '</svg>',
  ].join('')

  // `encodeURIComponent` rather than base64: the payload stays readable in the database, which
  // matters when someone is inspecting a document to see why an avatar looks wrong.
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}
