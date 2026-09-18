export interface SelectableUser {
  id: string
  displayName: string
}

export interface UserSelectProps {
  users: SelectableUser[]
  value: string | null
  onChange: (nextUserId: string | null) => void
}

/**
 * Presentational on purpose: it knows nothing about GraphQL or storage, so it can be rendered in a
 * test with a plain array of users.
 */
export function UserSelect({ users, value, onChange }: UserSelectProps) {
  return (
    <label className="flex items-center gap-2 text-xs text-slate-600">
      <span className="font-medium">Acting as</span>
      <select
        className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900"
        value={value ?? ''}
        onChange={(event) => {
          const next = event.target.value
          onChange(next === '' ? null : next)
        }}
      >
        <option value="">(nobody)</option>
        {users.map((user) => (
          <option key={user.id} value={user.id}>
            {user.displayName}
          </option>
        ))}
      </select>
    </label>
  )
}
