/**
 * Time formatting for message metadata.
 *
 * Separate from `MessageRow.tsx` so that file exports only components — Vite's fast refresh cannot
 * hot-replace a module that mixes a component with a plain function, so it falls back to a full
 * reload on every edit.
 *
 * `toLocaleTimeString` with no locale argument uses the runtime's locale: the seed data is English
 * but the reviewer's browser may not be, and honouring the browser is the correct default for a
 * chat timestamp.
 */

/** `HH:MM`, which is what the design's message metadata shows. */
export function formatMessageTime(value: string): string {
  const at = new Date(value)

  return Number.isNaN(at.getTime())
    ? ''
    : at.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}
