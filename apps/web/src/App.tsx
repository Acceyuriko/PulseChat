import { ApolloProvider } from '@apollo/client/react'
import { useCallback, useMemo, useState } from 'react'

import { createApolloClient } from './apollo/client'
import { ConversationListPane } from './features/conversations/ConversationListPane'
import { ConversationPane } from './features/conversations/ConversationPane'
import { IdentitySwitcher } from './features/identity/IdentitySwitcher'
import { useIdentity } from './identity/useIdentity'
import { useRealtime } from './realtime/useRealtime'
import { Shell } from './shell/Shell'

/**
 * The app shell and its two data-dependent panes.
 *
 * Split in two because the Apollo client is built **per identity** (the fake login travels in the
 * `x-user-id` header, see `apollo/client.ts`), so anything that uses `useQuery` has to be a child of
 * `ApolloProvider` rather than a sibling of it. `App` owns the identity and the provider;
 * `Workspace` is everything inside.
 */
export function App() {
  const [userId, setUserId] = useIdentity()

  // Rebuilt per identity, which also discards the previous user's cache — an identity switch must
  // never show another user's data.
  const apolloClient = useMemo(() => createApolloClient(userId), [userId])

  return (
    <ApolloProvider client={apolloClient}>
      {/*
       * Keyed on the identity so a switch remounts the workspace and its `selectedId` resets.
       * Without the key the selection survives, and the socket — which reconnects as the new user —
       * immediately re-subscribes the *previous* user's open conversation. The server refuses with
       * `FORBIDDEN`, and the pane keeps showing a conversation the new user cannot read. The
       * remount also drops the unread total and every pane's local state, which is the same rule:
       * nothing carries across identities.
       */}
      <Workspace key={userId ?? 'anonymous'} userId={userId} onIdentityChange={setUserId} />
    </ApolloProvider>
  )
}

function Workspace({
  userId,
  onIdentityChange,
}: {
  userId: string | null
  onIdentityChange: (nextUserId: string | null) => void
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [unreadTotal, setUnreadTotal] = useState(0)

  /**
   * Stabilised so `ConversationListPane`'s reporting effect does not re-run on every render of this
   * component — an inline arrow would be a new function each time and would make the effect fire
   * continuously.
   */
  const handleUnreadTotalChange = useCallback((total: number) => {
    setUnreadTotal(total)
  }, [])

  const realtime = useRealtime({ userId, activeConversationId: selectedId })

  if (userId === null) {
    return (
      <Shell
        unreadTotal={0}
        identity={<IdentitySwitcher value={null} onChange={onIdentityChange} />}
      >
        <div className="flex flex-1 items-center justify-center p-8">
          <div className="rounded-control border-hairline max-w-[420px] border border-dashed p-6 text-center">
            <h2 className="text-content text-[16px] font-medium">Pick an identity to begin</h2>
            <p className="text-content-muted mt-2 text-[13px] leading-[1.6]">
              Identity is kept in <code className="font-mono">sessionStorage</code>, so each browser
              tab is its own user. Open a second tab, pick someone else, and send a message between
              them — that is what the realtime channel is for.
            </p>
          </div>
        </div>
      </Shell>
    )
  }

  return (
    <Shell
      unreadTotal={unreadTotal}
      identity={<IdentitySwitcher value={userId} onChange={onIdentityChange} />}
    >
      <ConversationListPane
        viewerId={userId}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onUnreadTotalChange={handleUnreadTotalChange}
      />

      {selectedId === null ? (
        <div className="flex flex-1 items-center justify-center p-8">
          <p className="text-content-muted text-[13px]">
            Select a conversation to read it. Messages arrive live over socket.io.
          </p>
        </div>
      ) : (
        /*
         * Keyed on the conversation so switching remounts the pane: the composer's draft, the quote
         * being prepared, and the scroll position all belong to one conversation, and carrying them
         * across a switch is how a draft ends up on the wrong channel.
         */
        <ConversationPane
          key={selectedId}
          conversationId={selectedId}
          viewerId={userId}
          realtime={realtime}
        />
      )}
    </Shell>
  )
}
