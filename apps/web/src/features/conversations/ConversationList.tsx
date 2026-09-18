import { useQuery } from '@apollo/client/react'

import { graphql } from '../../gql'

const ConversationsQuery = graphql(/* GraphQL */ `
  query Conversations {
    conversations {
      id
      title
      updatedAt
      participants {
        id
        displayName
      }
      lastMessage {
        id
        body
        createdAt
        sender {
          id
          displayName
        }
      }
    }
  }
`)

const timestampFormat = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'short',
  timeStyle: 'short',
})

function formatTimestamp(value: string): string {
  const parsed = new Date(value)

  return Number.isNaN(parsed.getTime()) ? value : timestampFormat.format(parsed)
}

/**
 * The vertical slice: this list is rendered from documents that live in MongoDB, reached through
 * the GraphQL API, authorised by the identity in the header.
 */
export function ConversationList() {
  const { data, loading, error } = useQuery(ConversationsQuery)

  if (error !== undefined) {
    return (
      <p className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
        {error.message}
      </p>
    )
  }

  if (loading && data === undefined) {
    return <p className="text-sm text-slate-500">loading conversations…</p>
  }

  const conversations = data?.conversations ?? []

  if (conversations.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
        No conversations for this user yet. Run <code className="font-mono">pnpm seed</code> to
        create the sample data.
      </p>
    )
  }

  return (
    <ul className="flex flex-col gap-3">
      {conversations.map((conversation) => (
        <li
          key={conversation.id}
          className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
        >
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="font-medium">{conversation.title}</h2>
            <span className="text-xs text-slate-400">
              {formatTimestamp(conversation.updatedAt)}
            </span>
          </div>

          <p className="mt-1 text-xs text-slate-500">
            {conversation.participants.map((participant) => participant.displayName).join(', ')}
          </p>

          {conversation.lastMessage === null ? (
            <p className="mt-2 text-sm text-slate-400">No messages yet.</p>
          ) : (
            <p className="mt-2 text-sm text-slate-700">
              <span className="font-medium">{conversation.lastMessage.sender.displayName}: </span>
              {conversation.lastMessage.body}
            </p>
          )}
        </li>
      ))}
    </ul>
  )
}
