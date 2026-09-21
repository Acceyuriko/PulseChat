import { ApolloClient, HttpLink, InMemoryCache, type TypePolicies } from '@apollo/client'

const graphqlUrl = import.meta.env.VITE_GRAPHQL_URL ?? 'http://localhost:4000/graphql'

/**
 * Cache policy.
 *
 * Two things are configured here, and only the first is about correctness of lookups:
 *
 * 1. **Normalisation keys.** A type that appears in more than one operation needs a stable identity
 *    so it is stored once and patched everywhere. The default in-memory heuristic would key off
 *    `id` anyway — declaring it explicitly is about not depending on an undocumented heuristic.
 *    `Message` is the one that actually matters: it appears both as a conversation's `lastMessage`
 *    and inside its message list, and it has to be the *same* entity in both so a delete updates
 *    each place at once.
 *
 * 2. **Embedded values are not entities.** `ConversationMember` and `QuoteSnapshot` are marked
 *    `keyFields: false` on purpose. A member is only meaningful relative to its conversation, and a
 *    quote snapshot is a frozen copy that by design must *not* track changes to the message it
 *    points at — giving it an identity would make the excerpt update under the reader, which is the
 *    exact thing P5 exists to prevent.
 *
 * Note what is *not* here: no `Query.conversations` merge function and no sort. Re-ordering a list
 * by a value a socket event just changed is not a merge concern, and a merge function that sorted
 * would also run on every refetch and fight the server's own order. The list pane sorts on read
 * (P11); see `sortConversations` in `lib/write.ts`.
 */
const typePolicies: TypePolicies = {
  Conversation: { keyFields: ['id'] },
  Message: { keyFields: ['id'] },
  User: { keyFields: ['id'] },
  ConversationMember: { keyFields: false },
  QuoteSnapshot: { keyFields: false },
}

/**
 * The scaffold's identity is the `x-user-id` header, so the client is rebuilt whenever the
 * selected identity changes. That also throws away the previous user's cache, which is exactly the
 * behaviour we want — an identity switch should never show stale data from someone else.
 *
 * With real authentication this becomes a single client plus an auth link that injects the current
 * token.
 */
export function createApolloClient(userId: string | null): ApolloClient {
  return new ApolloClient({
    link: new HttpLink({
      uri: graphqlUrl,
      headers: userId === null ? {} : { 'x-user-id': userId },
    }),
    cache: new InMemoryCache({ typePolicies }),
    /**
     * Without this, `useQuery` re-fetches on mount and on every cache-and-network-style transition,
     * which would make switching conversations a spinner — and would hide a broken socket behind a
     * working poll. With `cache-first`, a stale list is *evidence* that the realtime path failed,
     * which is what a reviewer needs to see. The socket keeps the cache current (P8).
     *
     * One deliberate exception: `MessageStream` reads `cache-and-network`. `message:created` is
     * fan-out to the conversation room, so messages sent while a *different* conversation was open
     * never reached this tab — no socket fidelity can keep a room's entry current for a
     * conversation nobody is watching, and a cache-first read on re-entry would serve that stale
     * entry forever. The fetch rides the navigation, not an event, so D24 still holds.
     */
    defaultOptions: {
      watchQuery: { fetchPolicy: 'cache-first', nextFetchPolicy: 'cache-first' },
    },
  })
}
