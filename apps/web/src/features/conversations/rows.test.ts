import { describe, expect, it } from 'vitest'

import type { ConversationFieldsFragment } from '../../gql/graphql'
import { conversationLabel, conversationPreview, plainText, truncate } from './rows'

/**
 * The two rules the design encodes in its conversation rows — DM naming and the `Sender: ` prefix —
 * plus the plain-text reduction a preview needs. These are the rules a reviewer would check against
 * the design, so they are asserted rather than eyeballed.
 */

type Row = ConversationFieldsFragment

function makeRow(overrides: Partial<Row> = {}): Row {
  return {
    __typename: 'Conversation',
    id: 'c1',
    kind: 'CHANNEL',
    title: 'Announcements',
    unreadCount: 0,
    lastActivityAt: '2026-09-18T10:00:00.000Z',
    members: [member('u1', 'Jerry Wilson'), member('u2', 'Courtney Henry')],
    lastMessage: {
      __typename: 'Message',
      id: 'm1',
      body: 'hello there',
      createdAt: '2026-09-18T10:00:00.000Z',
      deletedAt: null,
      sender: {
        __typename: 'User',
        id: 'u2',
        displayName: 'Courtney Henry',
        avatarUrl: null,
      },
    },
    ...overrides,
  }
}

function member(id: string, displayName: string) {
  return {
    __typename: 'ConversationMember' as const,
    lastReadAt: null,
    user: { __typename: 'User' as const, id, displayName, avatarUrl: null, title: null },
  }
}

describe('conversationLabel', () => {
  it('names a channel after its title', () => {
    expect(conversationLabel(makeRow(), 'u1').name).toBe('Announcements')
  })

  it('names a DM after the other member, not the viewer', () => {
    const dm = makeRow({ kind: 'DM', title: null })

    expect(conversationLabel(dm, 'u1').name).toBe('Courtney Henry')
    expect(conversationLabel(dm, 'u2').name).toBe('Jerry Wilson')
  })

  it('reports the counterpart so the row can draw a single avatar', () => {
    const dm = makeRow({ kind: 'DM', title: null })

    expect(conversationLabel(dm, 'u1').counterpart?.displayName).toBe('Courtney Henry')
  })

  it('has no counterpart for a channel, which draws a collage instead', () => {
    expect(conversationLabel(makeRow(), 'u1').counterpart).toBeNull()
  })

  it('falls back rather than crashing when a channel has no title', () => {
    // The server requires a title for CHANNEL, so this is defensive — but a missing name is worse
    // than a placeholder, because an unlabelled row cannot be clicked confidently.
    expect(conversationLabel(makeRow({ title: null }), 'u1').name).toBe('Untitled channel')
  })

  it('falls back for a DM with no members at all', () => {
    const empty = makeRow({ kind: 'DM', title: null, members: [] })

    expect(conversationLabel(empty, 'u1').name).toBe('Direct message')
  })
})

describe('conversationPreview', () => {
  it('prefixes a channel preview with the sender name', () => {
    expect(conversationPreview(makeRow())).toBe('Courtney Henry: hello there')
  })

  it('does not prefix a DM preview, because the row already names the sender', () => {
    expect(conversationPreview(makeRow({ kind: 'DM', title: null }))).toBe('hello there')
  })

  it('says the message was deleted instead of showing a deleted body', () => {
    const deleted = makeRow({
      lastMessage: {
        __typename: 'Message',
        id: 'm1',
        body: 'secret',
        createdAt: '2026-09-18T10:00:00.000Z',
        deletedAt: '2026-09-18T11:00:00.000Z',
        sender: {
          __typename: 'User',
          id: 'u2',
          displayName: 'Courtney Henry',
          avatarUrl: null,
        },
      },
    })

    expect(conversationPreview(deleted)).toBe('This message was deleted')
  })

  it('handles a conversation with no messages', () => {
    expect(conversationPreview(makeRow({ lastMessage: null }))).toBe('No messages yet')
  })
})

describe('plainText', () => {
  it('renders a mention link as the readable @Name', () => {
    expect(plainText('[@Devon Lane](mention:abc123) please review')).toBe(
      '@Devon Lane please review',
    )
  })

  it('drops bold, italic and strikethrough markers', () => {
    expect(plainText('**bold** and *italic* and ~~struck~~')).toBe('bold and italic and struck')
  })

  it('keeps a lone asterisk, which is not emphasis', () => {
    expect(plainText('2 * 3 = 6')).toBe('2 * 3 = 6')
  })

  it('collapses whitespace and newlines into a single line', () => {
    expect(plainText('first line\n\n  second   line')).toBe('first line second line')
  })
})

describe('truncate', () => {
  it('leaves a short string alone', () => {
    expect(truncate('short', 10)).toBe('short')
  })

  it('appends an ellipsis when cutting', () => {
    expect(truncate('abcdefghij', 4)).toBe('abcd…')
  })

  it('counts codepoints, so an emoji is never split in half', () => {
    // Two astral characters; a naive `slice(0, 1)` would return half a surrogate pair.
    expect(truncate('🫢🫢', 1)).toBe('🫢…')
  })
})
