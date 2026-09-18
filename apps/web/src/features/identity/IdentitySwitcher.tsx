import { useQuery } from '@apollo/client/react'

import { UserSelect } from '../../components/UserSelect'
import { graphql } from '../../gql'

const UsersQuery = graphql(/* GraphQL */ `
  query Users {
    users {
      id
      displayName
    }
  }
`)

export interface IdentitySwitcherProps {
  value: string | null
  onChange: (nextUserId: string | null) => void
}

/**
 * Container: fetches the seeded users and hands them to the presentational `UserSelect`.
 */
export function IdentitySwitcher({ value, onChange }: IdentitySwitcherProps) {
  const { data, loading, error } = useQuery(UsersQuery)

  if (error !== undefined) {
    return <span className="text-xs text-rose-600">users failed to load</span>
  }

  if (loading && data === undefined) {
    return <span className="text-xs text-slate-400">loading users…</span>
  }

  return <UserSelect users={data?.users ?? []} value={value} onChange={onChange} />
}
