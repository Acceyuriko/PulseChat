import type { ApolloClient } from '@apollo/client'

import { ConversationsQuery, MessagesQuery } from '../graphql'

/**
 * Re-reads the queries the socket writes into, after a reconnect.
 *
 * A socket delivers events only while it is connected, and nothing replays what it missed: rooms
 * are dropped on disconnect, and a reconnect can land on a server that has never heard of the
 * session — every `tsx watch` restart in development is exactly that. So a reconnect opens a
 * **gap**, and the only record of what happened inside it is the database.
 *
 * This is not an exception to "socket events write the cache; there is no refetch" (D24). That
 * rule is about *events*: reacting to one with a refetch would leave the socket decorative, and
 * the data arriving by poll. A gap has no event to react to — the events never arrived — so
 * re-reading is the only way to close it. Events resume the stream; this resumes the state.
 *
 * Three properties the caller relies on:
 *
 *  - It refetches **active** queries matched by document, so a conversation the tab is not
 *    showing costs nothing, and the call is free when nothing is mounted at all.
 *  - It forces a network read. A cache-first read would hand back the same stale entry the gap
 *    left behind, which is the one result that must not happen here.
 *  - Overlap with events that arrive right after the reconnect is harmless: every merge is keyed
 *    by id (`lib/write.ts`), so a message caught by both paths is written once.
 *
 * The two queries are exactly the ones the socket handlers write into: the list (rows, badges,
 * previews) and the open conversation's stream. The `Conversation` entity is shared between the
 * list and the header through normalisation, so one read covers both.
 *
 * One rough edge, stated rather than hidden: in development Apollo logs `Unknown query named
 * "Messages"` whenever this runs with no conversation open, because a named document with no
 * observer reads as a mistake to its matcher. It is a no-op — there is nothing open to catch up
 * on, and the pane fetches when it first opens — and production builds never warn. Widening the
 * include to `'active'` would silence it at the cost of refetching whatever else is mounted.
 */
export function resyncRealtimeQueries(client: ApolloClient): Promise<unknown> {
  return client.refetchQueries({ include: [ConversationsQuery, MessagesQuery] })
}
