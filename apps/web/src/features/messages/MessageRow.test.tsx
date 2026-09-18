import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { MessageFieldsFragment } from '../../gql/graphql'
import { MessageRow } from './MessageRow'

/**
 * The message row's two conditional states, plus the toolbar's permission rule.
 *
 * These are worth asserting because both are cases a reviewer would try by hand: a soft-deleted
 * message must still occupy its place, and a delete button must not appear on someone else's
 * message (the server rejects it, so a rendered button would always fail).
 */

const lookup = { resolve: () => undefined }

function makeMessage(overrides: Partial<MessageFieldsFragment> = {}): MessageFieldsFragment {
  return {
    __typename: 'Message',
    id: 'm1',
    conversationId: 'c1',
    body: 'hello there',
    createdAt: '2026-09-18T10:00:00.000Z',
    deletedAt: null,
    sender: {
      __typename: 'User',
      id: 'u1',
      displayName: 'Jerry Wilson',
      avatarUrl: null,
      title: 'Product Manager@Acme',
    },
    replyTo: null,
    ...overrides,
  }
}

const noop = vi.fn()

/**
 * `MessageRow` renders an `<li>`, so it has to be mounted inside a list to be valid HTML — but the
 * wrapper is a `<div>` with an explicit `role="list"` rather than a `<ul>`.
 *
 * Reason: a markdown body can itself contain a `<ul>`, and two nested real lists make
 * `getByRole('list')` ambiguous. Declaring the wrapper's role keeps the semantics without adding a
 * second list element for a query to trip over.
 */
function renderRow(message: MessageFieldsFragment, viewerId: string) {
  return render(
    <div role="list">
      <MessageRow
        message={message}
        viewerId={viewerId}
        showsHeader
        showAuthorName
        lookup={lookup}
        onQuote={noop}
        onDelete={noop}
      />
    </div>,
  )
}

describe('MessageRow', () => {
  it('renders the body', () => {
    renderRow(makeMessage(), 'u1')

    expect(screen.getByText('hello there')).toBeInTheDocument()
  })

  it('renders a deleted message as a placeholder, not as its body', () => {
    renderRow(makeMessage({ deletedAt: '2026-09-18T11:00:00.000Z', body: 'secret' }), 'u1')

    expect(screen.getByTestId('deleted-message')).toHaveTextContent('This message was deleted')
    expect(screen.queryByText('secret')).not.toBeInTheDocument()
  })

  it('offers quote and delete on the viewer’s own message', () => {
    renderRow(makeMessage(), 'u1')

    expect(screen.getByLabelText('Quote this message')).toBeInTheDocument()
    expect(screen.getByLabelText('Delete this message')).toBeInTheDocument()
  })

  it('offers no toolbar on someone else’s message', () => {
    // Deletion is sender-only on the server, so a delete button here would always fail.
    renderRow(makeMessage(), 'u2')

    expect(screen.queryByLabelText('Quote this message')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Delete this message')).not.toBeInTheDocument()
  })

  it('offers no toolbar on a deleted message', () => {
    renderRow(makeMessage({ deletedAt: '2026-09-18T11:00:00.000Z' }), 'u1')

    expect(screen.queryByLabelText('Delete this message')).not.toBeInTheDocument()
  })

  it('renders a quote card from the frozen snapshot', () => {
    renderRow(
      makeMessage({
        replyTo: {
          __typename: 'QuoteSnapshot',
          messageId: 'm0',
          senderId: 'u2',
          senderDisplayName: 'Devon Lane',
          bodyExcerpt: 'Check out Vanilla Forums',
          createdAt: '2026-09-18T09:00:00.000Z',
        },
      }),
      'u1',
    )

    const card = screen.getByTestId('quoted-card')

    expect(card).toHaveTextContent('Devon Lane:')
    expect(card).toHaveTextContent('Check out Vanilla Forums')
  })

  it('renders a markdown body as formatted text without raw markers', () => {
    renderRow(makeMessage({ body: '**bold** and *italic*' }), 'u1')

    /*
     * `closest` rather than `.tagName`: the renderer wraps each text run in a `<span>` so that React
     * keys are stable, so the element that *directly* holds "bold" is a span inside the `<strong>`.
     * Asserting on the nearest `<strong>` ancestor is asserting the structure that matters.
     */
    expect(screen.getByText('bold').closest('strong')).not.toBeNull()
    expect(screen.getByText('italic').closest('em')).not.toBeNull()
    expect(screen.queryByText('**bold**')).not.toBeInTheDocument()
  })

  it('renders a list body as list items', () => {
    renderRow(makeMessage({ body: '- one\n- two' }), 'u1')

    // Asserted on the items' own text rather than a count: the row itself is an `<li>`, so counting
    // would be off by one in a way that reads like a parser bug.
    const items = screen.getAllByRole('listitem').map((item) => item.textContent)

    expect(items).toContain('one')
    expect(items).toContain('two')
  })

  it('renders a mention as @Name and tags it with the user id', () => {
    renderRow(makeMessage({ body: '[@Devon Lane](mention:u9) ping' }), 'u1')

    const mention = screen.getByText('@Devon Lane')

    expect(mention).toHaveAttribute('data-mention-id', 'u9')
  })
})
