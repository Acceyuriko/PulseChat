import { describe, expect, it } from 'vitest'

import {
  type ConversationLike,
  type MessageLike,
  type UserLike,
  toConversation,
  toMessage,
  toUser,
} from '../mappers.js'

const createdAt = new Date('2026-09-01T10:00:00.000Z')
const updatedAt = new Date('2026-09-02T11:30:00.000Z')

const ada: UserLike = {
  _id: 'user-ada',
  displayName: 'Ada Lovelace',
  avatarUrl: null,
  title: 'CTO@Apple',
  createdAt,
}

describe('toUser', () => {
  it('exposes the id as a string and keeps a null avatar as null', () => {
    expect(toUser(ada)).toEqual({
      id: 'user-ada',
      displayName: 'Ada Lovelace',
      avatarUrl: null,
      title: 'CTO@Apple',
      createdAt,
    })
  })

  it('normalises a missing avatar and title to null', () => {
    const bare: UserLike = { _id: 'user-2', displayName: 'Grace Hopper', createdAt }
    const result = toUser(bare)

    expect(result.avatarUrl).toBeNull()
    expect(result.title).toBeNull()
  })
})

describe('toMessage', () => {
  it('maps the populated sender and stringifies the conversation id', () => {
    const message: MessageLike = {
      _id: 'message-1',
      conversationId: 'conversation-1',
      senderId: ada,
      body: 'hello',
      replyTo: null,
      createdAt,
      deletedAt: null,
    }

    expect(toMessage(message)).toEqual({
      id: 'message-1',
      conversationId: 'conversation-1',
      body: 'hello',
      sender: {
        id: 'user-ada',
        displayName: 'Ada Lovelace',
        avatarUrl: null,
        title: 'CTO@Apple',
        createdAt,
      },
      replyTo: null,
      createdAt,
      deletedAt: null,
    })
  })

  it('maps a frozen quote snapshot without looking the quoted message up', () => {
    const message: MessageLike = {
      _id: 'message-2',
      conversationId: 'conversation-1',
      senderId: ada,
      body: 'agreeing',
      replyTo: {
        messageId: 'message-1',
        senderId: 'user-2',
        senderDisplayName: 'Devon Lane',
        bodyExcerpt: 'Check out Vanilla Forums',
        createdAt,
      },
      createdAt,
      deletedAt: null,
    }

    expect(toMessage(message).replyTo).toEqual({
      messageId: 'message-1',
      senderId: 'user-2',
      senderDisplayName: 'Devon Lane',
      bodyExcerpt: 'Check out Vanilla Forums',
      createdAt,
    })
  })

  /**
   * A deleted message maps like any other, with `deletedAt` set. The id has to stay resolvable so
   * an existing reply that quotes it still renders.
   */
  it('carries deletedAt through for a soft-deleted message', () => {
    const deletedAt = new Date('2026-09-03T09:00:00.000Z')
    const message: MessageLike = {
      _id: 'message-3',
      conversationId: 'conversation-1',
      senderId: ada,
      body: 'oops',
      createdAt,
      deletedAt,
    }

    expect(toMessage(message).deletedAt).toBe(deletedAt)
  })
})

describe('toConversation', () => {
  it('maps members with their read cursors and keeps a null title null for a DM', () => {
    const conversation: ConversationLike = {
      _id: 'conversation-1',
      kind: 'DM',
      title: null,
      members: [
        { userId: ada, lastReadAt: createdAt },
        { userId: { _id: 'user-2', displayName: 'Grace Hopper', createdAt }, lastReadAt: null },
      ],
      createdAt,
      updatedAt,
    }

    const result = toConversation(conversation)

    expect(result.id).toBe('conversation-1')
    expect(result.kind).toBe('DM')
    expect(result.title).toBeNull()
    expect(result.members.map((member) => member.user.displayName)).toEqual([
      'Ada Lovelace',
      'Grace Hopper',
    ])
    expect(result.members.map((member) => member.lastReadAt)).toEqual([createdAt, null])
    expect(result.updatedAt).toBe(updatedAt)
  })

  it('keeps a channel title', () => {
    const conversation: ConversationLike = {
      _id: 'conversation-2',
      kind: 'CHANNEL',
      title: 'Product sync',
      members: [{ userId: ada, lastReadAt: null }],
      createdAt,
      updatedAt,
    }

    expect(toConversation(conversation).title).toBe('Product sync')
  })
})
