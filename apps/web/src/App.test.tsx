import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { App } from './App'
import { ConversationQuery, ConversationsQuery, UsersQuery } from './graphql'
import { useRealtime } from './realtime/useRealtime'

/**
 * Identity switching resets the workspace.
 *
 * This is a regression test with a specific failure behind it: `selectedId` used to survive a
 * switch, so the reconnected socket immediately subscribed the *previous* user's open conversation
 * — a conversation the new user is not a member of. The server answered `FORBIDDEN`, the realtime
 * panel stuck on that error, and the pane showed "Conversation not found" until something else was
 * picked. Both halves of that failure are asserted below.
 *
 * Only the data layers are mocked. The workspace itself — the list pane, the selection state, the
 * remount — is the real component tree, because that is where the bug lived.
 */

const { useQueryMock, useMutationMock } = vi.hoisted(() => ({
  useQueryMock: vi.fn(),
  useMutationMock: vi.fn(),
}))

vi.mock('@apollo/client/react', () => ({
  ApolloProvider: ({ children }: { children?: ReactNode }) => children,
  useQuery: useQueryMock,
  useMutation: useMutationMock,
}))

vi.mock('./realtime/useRealtime', () => ({
  useRealtime: vi.fn(() => ({ status: 'idle', detail: null, receivedCount: 0, lastEvent: null })),
}))

const users = [
  { id: 'user-a', displayName: 'Ada Lovelace', avatarUrl: null, title: 'CTO@Acme' },
  { id: 'user-b', displayName: 'Grace Hopper', avatarUrl: null, title: 'Eng Manager@Acme' },
]

const general = {
  __typename: 'Conversation',
  id: 'conv-general',
  kind: 'CHANNEL',
  title: 'General',
  members: [
    { __typename: 'ConversationMember', user: users[0], lastReadAt: null },
    { __typename: 'ConversationMember', user: users[1], lastReadAt: null },
  ],
  unreadCount: 0,
  lastActivityAt: '2026-09-21T10:00:00.000Z',
  lastMessage: null,
}

beforeEach(() => {
  sessionStorage.clear()
  vi.clearAllMocks()

  useQueryMock.mockImplementation((document: unknown) => {
    if (document === UsersQuery) {
      return { data: { users }, loading: false }
    }

    if (document === ConversationsQuery) {
      return { data: { conversations: [general] }, loading: false }
    }

    if (document === ConversationQuery) {
      return { data: { conversation: general }, loading: false }
    }

    return { data: undefined, loading: true }
  })

  useMutationMock.mockImplementation(() => [vi.fn(), { loading: false }])
})

/** The switcher's select. Re-queried each time, because a switch remounts it. */
function identitySelect(): HTMLElement {
  return screen.getByRole('combobox')
}

/** What the socket layer was last asked to be and to subscribe. */
function lastRealtimeOptions() {
  return vi.mocked(useRealtime).mock.calls.at(-1)?.[0]
}

describe('identity switching', () => {
  it('drops the open conversation from the subscription when the user changes', () => {
    render(<App />)

    fireEvent.change(identitySelect(), { target: { value: 'user-a' } })
    fireEvent.click(screen.getByRole('button', { name: /General/ }))

    expect(lastRealtimeOptions()?.userId).toBe('user-a')
    expect(lastRealtimeOptions()?.activeConversationId).toBe('conv-general')

    fireEvent.change(identitySelect(), { target: { value: 'user-b' } })

    // The new identity must not carry the old conversation into its socket: subscribing it would
    // earn a FORBIDDEN from the server's membership check.
    expect(lastRealtimeOptions()?.userId).toBe('user-b')
    expect(lastRealtimeOptions()?.activeConversationId).toBeNull()
  })

  it('does not leave the previous user’s conversation on screen', () => {
    render(<App />)

    fireEvent.change(identitySelect(), { target: { value: 'user-a' } })
    fireEvent.click(screen.getByRole('button', { name: /General/ }))

    expect(screen.getByRole('region', { name: 'Conversation' })).toBeInTheDocument()

    fireEvent.change(identitySelect(), { target: { value: 'user-b' } })

    // Not "Conversation not found": no conversation at all until the new user picks one.
    expect(screen.queryByRole('region', { name: 'Conversation' })).not.toBeInTheDocument()
    expect(screen.getByText(/Select a conversation to read it/)).toBeInTheDocument()
  })
})
