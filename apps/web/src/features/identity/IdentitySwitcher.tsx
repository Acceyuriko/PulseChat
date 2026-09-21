import { useQuery } from '@apollo/client/react'

import { Avatar } from '../../components/Avatar'
import { UsersQuery } from '../../graphql'

export interface IdentitySwitcherProps {
  value: string | null
  onChange: (nextUserId: string | null) => void
}

/**
 * The fake login.
 *
 * A `<select>` rather than anything cleverer, because the whole point is that a reviewer can put two
 * tabs side by side, pick a different identity in each, and watch a message travel between them. The
 * per-tab part is `sessionStorage` (P9) — see `identity/storage.ts`.
 */
export function IdentitySwitcher({ value, onChange }: IdentitySwitcherProps) {
  const { data, loading, error } = useQuery(UsersQuery)

  if (error !== undefined) {
    return <span className="text-warning text-[12px]">Users failed to load</span>
  }

  if (loading && data === undefined) {
    return <span className="text-content-muted text-[12px]">Loading users…</span>
  }

  const users = data?.users ?? []
  const current = users.find((user) => user.id === value) ?? null

  return (
    <label className="rounded-pill border-hairline flex items-center gap-2 border py-1 pr-3 pl-1.5">
      {current === null ? (
        <span
          aria-hidden
          className="bg-highlight-2 text-content-muted flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full text-[10px]"
        >
          ?
        </span>
      ) : (
        <Avatar user={current} size="sm" />
      )}

      <span className="sr-only">Acting as</span>

      <select
        value={value ?? ''}
        onChange={(event) => {
          const next = event.target.value
          onChange(next === '' ? null : next)
        }}
        className="text-content max-w-[160px] bg-transparent text-[12px] outline-none"
      >
        <option value="">Pick an identity…</option>
        {users.map((user) => (
          <option key={user.id} value={user.id} className="bg-card text-content">
            {user.displayName}
            {user.title === null ? '' : ` — ${user.title}`}
          </option>
        ))}
      </select>
    </label>
  )
}
