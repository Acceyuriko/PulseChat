import { initialsOf } from './initials'

/**
 * Avatars.
 *
 * The seed data stores a deterministic letter avatar as a `data:image/svg+xml` URI on
 * `User.avatarUrl` (see `apps/api/src/domain/avatar.ts`), so there is no external avatar service and
 * no network request for a picture — which is what keeps the "clone and run" promise in the README
 * true.
 *
 * These components render whatever `avatarUrl` holds; the initials fallback is for a user whose
 * avatar is null, so the layout does not collapse into an empty circle.
 */

export interface AvatarUser {
  id: string
  displayName: string
  avatarUrl: string | null
}

const SIZES = {
  sm: 'h-[30px] w-[30px] text-[11px]',
  md: 'h-[38px] w-[38px] text-[13px]',
} as const

export type AvatarSize = keyof typeof SIZES

export function Avatar({ user, size = 'md' }: { user: AvatarUser; size?: AvatarSize }) {
  const className = `${SIZES[size]} shrink-0 rounded-full object-cover`

  if (user.avatarUrl === null) {
    return (
      <span
        aria-hidden
        className={`${SIZES[size]} bg-highlight-2 text-content flex shrink-0 items-center justify-center rounded-full font-medium`}
      >
        {initialsOf(user.displayName)}
      </span>
    )
  }

  return <img src={user.avatarUrl} alt="" aria-hidden className={className} />
}

/**
 * The overlapping avatar cluster a channel row shows.
 *
 * Capped at three, and the cap is the point: a ten-member channel would otherwise produce a row of
 * ten 30px avatars that overflows the 340px pane. The overlap is a negative margin rather than
 * absolute positioning, so the cluster's width stays predictable and the row's layout does not
 * depend on the member count.
 */
export function AvatarCollage({
  users,
  size = 'md',
  max = 3,
}: {
  users: AvatarUser[]
  size?: AvatarSize
  max?: number
}) {
  const shown = users.slice(0, max)

  if (shown.length === 0) {
    return (
      <span
        aria-hidden
        className={`${SIZES[size]} bg-highlight-2 text-content-muted flex shrink-0 items-center justify-center rounded-full text-[11px]`}
      >
        ?
      </span>
    )
  }

  return (
    <span aria-hidden className="flex shrink-0 items-center">
      {shown.map((user, index) => (
        <span
          key={user.id}
          // The ring is drawn in the row's own background colour so the overlap reads as depth
          // rather than as avatars colliding.
          className={`ring-card rounded-full ring-2 ${index === 0 ? '' : '-ml-2.5'}`}
        >
          <Avatar user={user} size={size} />
        </span>
      ))}
    </span>
  )
}
