import { ApolloClient, ApolloLink, InMemoryCache } from '@apollo/client'
import { of } from 'rxjs'
import { describe, expect, it, vi } from 'vitest'

import { ConversationsQuery, MessagesQuery, UsersQuery } from '../graphql'
import { MESSAGES_QUERY_LIMIT } from '../lib/write'
import { resyncRealtimeQueries } from './resync'

/**
 * The resync, exercised against the seam that decides what it touches: a link that records
 * operation names. Two properties matter, and both are about *scope* — that it re-reads exactly
 * the socket-driven queries from the network, and that nothing else is collateral.
 *
 * The cache is primed before the queries are activated, so their first reads are cache hits and
 * the link records nothing at all. Every operation below therefore belongs to the resync.
 */

const MESSAGES_VARIABLES = { conversationId: 'conv-1', limit: MESSAGES_QUERY_LIMIT }

/**
 * Apollo warns in development when an included document has no active observer. Cases two and
 * three exercise exactly that state on purpose — `resync.ts` explains why the call is still
 * correct there — so the warning is silenced rather than left to look like a failure.
 */
function quietApollo(): () => void {
  const spy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

  return () => {
    spy.mockRestore()
  }
}

/** Responses to hand back per operation name — empty results are enough to keep refetches green. */
const RESPONSES: Record<string, unknown> = {
  Conversations: { conversations: [] },
  Messages: { messages: [] },
  Users: { users: [] },
}

function recordingClient() {
  const operations: string[] = []

  const link = new ApolloLink((operation) => {
    const name = operation.operationName ?? '(anonymous)'
    operations.push(name)

    return of({ data: RESPONSES[name] ?? {} })
  })

  return { client: new ApolloClient({ link, cache: new InMemoryCache() }), operations }
}

/** Primes both entries so a cache-first read is complete and never reaches the link. */
function prime(client: ApolloClient): void {
  client.cache.writeQuery({ query: ConversationsQuery, data: { conversations: [] } })
  client.cache.writeQuery({
    query: MessagesQuery,
    variables: MESSAGES_VARIABLES,
    data: { messages: [] },
  })
  client.cache.writeQuery({ query: UsersQuery, data: { users: [] } })
}

/** Activates a query the way a mounted component does: `watchQuery` plus a subscriber. */
function activate(client: ApolloClient): void {
  client.watchQuery({ query: ConversationsQuery }).subscribe({ next: () => undefined })
  client
    .watchQuery({ query: MessagesQuery, variables: MESSAGES_VARIABLES })
    .subscribe({ next: () => undefined })
  client.watchQuery({ query: UsersQuery }).subscribe({ next: () => undefined })
}

describe('resyncRealtimeQueries', () => {
  it('re-reads both socket-driven queries from the network, warm cache or not', async () => {
    const { client, operations } = recordingClient()
    prime(client)
    activate(client)

    expect(operations).toEqual([])

    await resyncRealtimeQueries(client)

    // `Messages` is refetched with the variables the open pane reads with — the query is matched
    // by document, the variables ride along from the active observable.
    expect(operations).toHaveLength(2)
    expect(operations).toContain('Conversations')
    expect(operations).toContain('Messages')
  })

  it('leaves queries the socket does not feed alone, even when they are active', async () => {
    const restore = quietApollo()
    const { client, operations } = recordingClient()
    prime(client)
    client.watchQuery({ query: UsersQuery }).subscribe({ next: () => undefined })

    await resyncRealtimeQueries(client)

    // The control for the case above. `include: 'active'` would refetch `Users` too and would
    // keep refetching whatever a future pane happens to mount; the explicit document list does
    // not, which is the point of spelling it out in `resync.ts`.
    expect(operations).toEqual([])
    restore()
  })

  it('is a no-op, not an error, when nothing is mounted', async () => {
    const restore = quietApollo()
    const { client, operations } = recordingClient()

    // `connect` can land before the panes have mounted their queries. Apollo skips a document
    // with no active observable rather than throwing, and this is what that call site depends on.
    await resyncRealtimeQueries(client)

    expect(operations).toEqual([])
    restore()
  })
})
