import type { ReactNode } from 'react'

/**
 * The application shell: top bar, left nav rail, and a slot for the two content panes.
 *
 * The top bar and the nav rail are **static** (P1). The design shows a whole community product —
 * Forum, Matches, Members, Contributors, two search boxes, notifications, a timezone — and the
 * assignment asks for a chat UI that does not have to follow the design 100%. Rendering the chrome
 * statically keeps the first impression faithful without implementing modules nobody asked for, and
 * it is honest about what the app does: every non-`Chat` item is inert and says so via `aria-disabled`
 * rather than pretending to be clickable.
 */

export interface ShellProps {
  /** The unread badge on the `Chat` nav item — the sum of the list's per-conversation counts. */
  unreadTotal: number
  /** The identity switcher, rendered in the top bar. */
  identity: ReactNode
  /** The list pane and the conversation pane. */
  children: ReactNode
}

const NAV_GROUPS: { heading: string; items: string[] }[] = [
  { heading: 'Engage', items: ['Forum', 'Chat', 'Matches'] },
  { heading: 'People', items: ['Members', 'Contributors'] },
]

/** Which nav item the app actually implements. Everything else renders as inert chrome. */
const ACTIVE_NAV_ITEM = 'Chat'

export function Shell({ unreadTotal, identity, children }: ShellProps) {
  return (
    <div className="bg-canvas text-content flex h-full flex-col">
      <TopBar identity={identity} />
      <div className="flex min-h-0 flex-1">
        <NavRail unreadTotal={unreadTotal} />
        {children}
      </div>
    </div>
  )
}

function TopBar({ identity }: { identity: ReactNode }) {
  return (
    <header className="border-hairline flex h-[70px] shrink-0 items-center gap-4 border-b px-5">
      <div className="flex items-center gap-2.5">
        <LogoMark />
        <span className="text-content text-[15px] font-semibold whitespace-nowrap">
          Gradual Community
        </span>
      </div>

      {/*
        Static search, per P1. It is a real input so it looks and focuses correctly, but it is
        `readOnly` — a box that accepts typing and then searches nothing is worse than one that
        visibly does not.
      */}
      <div className="rounded-control border-hairline ml-2 hidden min-w-0 flex-1 items-center gap-2 border px-3 py-2 lg:flex">
        <SearchIcon />
        <input
          readOnly
          aria-label="Search (not implemented)"
          placeholder="Search"
          className="text-content-muted placeholder:text-content-muted w-full bg-transparent text-[13px] outline-none"
        />
      </div>

      <div className="ml-auto flex items-center gap-3">
        <span className="text-content-muted hidden items-center gap-1.5 text-[12px] whitespace-nowrap xl:flex">
          <ClockIcon />
          UTC -05:00 Chicago
        </span>
        <IconButton label="Notifications (not implemented)">
          <BellIcon />
        </IconButton>
        <IconButton label="Help (not implemented)">
          <HelpIcon />
        </IconButton>
        {identity}
      </div>
    </header>
  )
}

/**
 * The nav rail.
 *
 * Below 1100px it collapses to icons: the design's 165px rail plus a 340px list plus a conversation
 * pane does not fit on a 1366-wide laptop, and 1366 is a common corporate default (P12).
 */
function NavRail({ unreadTotal }: { unreadTotal: number }) {
  return (
    <nav
      aria-label="Primary"
      className="border-hairline flex w-[60px] shrink-0 flex-col border-r pt-[26px] pb-4 min-[1100px]:w-[165px] min-[1100px]:pt-[60px]"
    >
      {NAV_GROUPS.map((group, index) => (
        <div
          key={group.heading}
          className={index === 0 ? '' : 'border-hairline mt-4 border-t pt-4'}
        >
          <p className="text-content-muted hidden px-4 pb-2 text-[11px] font-medium tracking-wide uppercase min-[1100px]:block">
            {group.heading}
          </p>
          <ul>
            {group.items.map((item) => (
              <NavItem
                key={item}
                label={item}
                active={item === ACTIVE_NAV_ITEM}
                badge={item === ACTIVE_NAV_ITEM && unreadTotal > 0 ? unreadTotal : null}
              />
            ))}
          </ul>
        </div>
      ))}

      <div className="mt-auto px-2 min-[1100px]:px-4">
        <span className="rounded-popover bg-card-2 text-content-muted flex items-center justify-center gap-1.5 px-2 py-1.5 text-[11px] min-[1100px]:justify-start">
          <SparkIcon />
          <span className="hidden min-[1100px]:inline">Powered by Gradual</span>
        </span>
      </div>
    </nav>
  )
}

function NavItem({
  label,
  active,
  badge,
}: {
  label: string
  active: boolean
  badge: number | null
}) {
  return (
    <li>
      <span
        /*
         * `aria-current` on the real item, `aria-disabled` on the rest. The inert ones are spans, not
         * buttons: a button that does nothing is a lie a keyboard user has to discover.
         */
        {...(active ? { 'aria-current': 'page' as const } : { 'aria-disabled': true })}
        title={active ? undefined : `${label} is not part of this assignment`}
        className={`rounded-control mx-2 flex items-center gap-2.5 px-2.5 py-2 text-[13px] min-[1100px]:mx-4 ${
          active
            ? 'bg-card-2 text-content font-medium'
            : 'text-content-muted cursor-default opacity-60'
        }`}
      >
        <NavGlyph label={label} />
        <span className="hidden min-[1100px]:inline">{label}</span>
        {badge !== null && (
          <span className="rounded-badge bg-warning ml-auto min-w-[18px] px-1.5 py-px text-center text-[11px] leading-4 font-medium text-white">
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </span>
    </li>
  )
}

/** A two-letter stand-in for the design's icon set, which is not in the repo. */
function NavGlyph({ label }: { label: string }) {
  return (
    <span
      aria-hidden
      className="bg-highlight-2/40 text-content flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[4px] text-[9px] font-semibold"
    >
      {label.slice(0, 1)}
    </span>
  )
}

function IconButton({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span
      aria-hidden
      title={label}
      className="rounded-control text-content-muted flex h-8 w-8 items-center justify-center"
    >
      {children}
    </span>
  )
}

/*
 * Inline SVG rather than an icon package: the design uses Figma component-library icons that are not
 * in this repo, and adding a dependency to draw eight glyphs would be a poor trade. These are drawn
 * to the same 16px box. `currentColor` on each means they inherit whatever text colour is in play,
 * so no icon needs its own colour prop.
 */

function LogoMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <rect width="18" height="18" rx="5" fill="var(--color-outgoing)" />
      <path d="M5 11.5V6.5h4a2.5 2.5 0 0 1 0 5H5Z" fill="var(--color-canvas)" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="m10.5 10.5 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function ClockIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 5v3.5l2.5 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function BellIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M4 6.5a4 4 0 1 1 8 0c0 3 1 4 1 4H3s1-1 1-4Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M6.5 12.5a1.5 1.5 0 0 0 3 0" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

function HelpIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M6.5 6.2a1.6 1.6 0 1 1 2.3 1.5c-.5.3-.8.6-.8 1.1v.2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="8" cy="11.3" r="0.9" fill="currentColor" />
    </svg>
  )
}

function SparkIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M8 2l1.4 4.6L14 8l-4.6 1.4L8 14l-1.4-4.6L2 8l4.6-1.4L8 2Z" fill="currentColor" />
    </svg>
  )
}
