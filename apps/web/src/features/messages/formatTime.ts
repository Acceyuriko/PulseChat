/**
 * Time formatting for message metadata.
 *
 * Separate from `MessageRow.tsx` so that file exports only components — Vite's fast refresh cannot
 * hot-replace a module that mixes a component with a plain function, so it falls back to a full
 * reload on every edit.
 *
 * The locale is pinned to `en-US` rather than left to the runtime. Every other string in this UI is
 * English — the seed data, `Today` / `Yesterday`, the weekday separators — so a timestamp that
 * followed a Chinese or German browser would render the one screen in two languages at once.
 *
 * `hour12: false` rides along because `en-US` defaults to a 12-hour clock, and `02:42 PM` is a
 * wider string than the compact `14:42` the design draws. Without it the fix for the language
 * would have quietly changed the format.
 */

/** `HH:MM`, which is what the design's message metadata shows. */
export function formatMessageTime(value: string): string {
  const at = new Date(value)

  return Number.isNaN(at.getTime())
    ? ''
    : at.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
}
