import { ApolloProvider } from '@apollo/client/react'
import { useMemo } from 'react'

import { createApolloClient } from './apollo/client'
import { ConnectionBadge } from './components/ConnectionBadge'
import { ConversationList } from './features/conversations/ConversationList'
import { IdentitySwitcher } from './features/identity/IdentitySwitcher'
import { useIdentity } from './identity/useIdentity'
import { useRealtime } from './realtime/useRealtime'

function EmptyState() {
  return (
    <p className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
      Pick an identity in the header to see that user&apos;s conversations.
    </p>
  )
}

export function App() {
  const [userId, setUserId] = useIdentity()

  // Rebuilt per identity because the identity travels in the `x-user-id` header (see apollo/client.ts).
  const apolloClient = useMemo(() => createApolloClient(userId), [userId])
  const realtime = useRealtime(userId)

  return (
    <ApolloProvider client={apolloClient}>
      <div className="min-h-screen bg-slate-50 text-slate-900">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-4 px-6 py-4">
            <div>
              <h1 className="text-lg font-semibold">PulseChat</h1>
              <p className="text-xs text-slate-500">
                Scaffold: React + GraphQL + MongoDB + socket.io
              </p>
            </div>
            <div className="flex items-center gap-4">
              <ConnectionBadge status={realtime.status} detail={realtime.detail} />
              <IdentitySwitcher value={userId} onChange={setUserId} />
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-4xl px-6 py-8">
          {userId === null ? <EmptyState /> : <ConversationList />}
        </main>
      </div>
    </ApolloProvider>
  )
}
