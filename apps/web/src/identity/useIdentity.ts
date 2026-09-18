import { useCallback, useState } from 'react'

import { readStoredUserId, writeStoredUserId } from './storage'

export type IdentitySetter = (nextUserId: string | null) => void

/**
 * The single place the frontend holds "who am I acting as". Swapping the fake login for real
 * authentication means changing this hook, not every component that consumes it.
 */
export function useIdentity(): [userId: string | null, setUserId: IdentitySetter] {
  const [userId, setUserId] = useState<string | null>(() => readStoredUserId())

  const select = useCallback<IdentitySetter>((nextUserId) => {
    writeStoredUserId(nextUserId)
    setUserId(nextUserId)
  }, [])

  return [userId, select]
}
