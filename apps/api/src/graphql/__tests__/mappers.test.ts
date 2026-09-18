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
  createdAt,
}

describe('toUser', () => {
  it('exposes the id as a string and keeps a null avatar as null', () => {
    expect(toUser(ada)).toEqual({
      id: 'user-ada',
      displayName: 'Ada Lovelace',
      avatarUrl: null,
      createdAt,
    })
  })

  it('normalises a missing avatar field to null', () => {
    const withoutAvatar: UserLike = { _id: 'user-2', displayName: 'Grace Hopper', createdAt }

    expect(toUser(withoutAvatar).avatarUrl).toBeNull()
  })
})

describe('toMessage', () => {
  it('maps the populated sender and stringifies the conversation id', () => {
    const message: MessageLike = {
      _id: 'message-1',
      conversationId: 'conversation-1',
      senderId: ada,
      body: 'hello',
      createdAt,
    }

    expect(toMessage(message)).toEqual({
      id: 'message-1',
      conversationId: 'conversation-1',
      body: 'hello',
      sender: {
        id: 'user-ada',
        displayName: 'Ada Lovelace',
        avatarUrl: null,
        createdAt,
      },
      createdAt,
    })
  })
})

describe('toConversation', () => {
  it('maps every participant', () => {
    const conversation: ConversationLike = {
      _id: 'conversation-1',
      title: 'Product sync',
      participantIds: [ada, { _id: 'user-2', displayName: 'Grace Hopper', createdAt }],
      createdAt,
      updatedAt,
    }

    const result = toConversation(conversation)

    expect(result.id).toBe('conversation-1')
    expect(result.title).toBe('Product sync')
    expect(result.participants.map((participant) => participant.displayName)).toEqual([
      'Ada Lovelace',
      'Grace Hopper',
    ])
    expect(result.updatedAt).toBe(updatedAt)
  })
})
