import { connectDatabase, disconnectDatabase } from '../db/connection.js'
import { ConversationModel } from '../models/conversation.js'
import { MessageModel } from '../models/message.js'
import { UserModel } from '../models/user.js'

interface SeedMessage {
  senderIndex: number
  body: string
}

interface SeedConversation {
  title: string
  participantIndexes: number[]
  messages: SeedMessage[]
}

const SEED_USERS = [
  { displayName: 'Ada Lovelace' },
  { displayName: 'Grace Hopper' },
  { displayName: 'Alan Turing' },
]

const SEED_CONVERSATIONS: SeedConversation[] = [
  {
    title: 'Design review',
    participantIndexes: [0, 2],
    messages: [
      { senderIndex: 2, body: 'Uploaded the conversation list frames, take a look.' },
      { senderIndex: 0, body: 'Looks good — I can scaffold the UI against these.' },
    ],
  },
  {
    title: 'Product sync',
    participantIndexes: [0, 1],
    messages: [
      { senderIndex: 0, body: 'Morning! Split the GraphQL schema by domain.' },
      { senderIndex: 1, body: 'Nice. Did the socket event contract land too?' },
      { senderIndex: 0, body: 'Yep — event names now live in packages/shared.' },
      { senderIndex: 1, body: 'That will save us from string literals drifting apart.' },
    ],
  },
]

function pick<T>(items: T[], index: number, label: string): T {
  const value = items[index]

  if (value === undefined) {
    throw new Error(`Seed data references ${label} index ${index}, which does not exist`)
  }

  return value
}

async function seed(): Promise<void> {
  await connectDatabase()

  await Promise.all([
    UserModel.deleteMany({}),
    ConversationModel.deleteMany({}),
    MessageModel.deleteMany({}),
  ])

  const users = await UserModel.create(SEED_USERS)

  for (const definition of SEED_CONVERSATIONS) {
    const participants = definition.participantIndexes.map((index) => pick(users, index, 'user'))

    const conversation = await ConversationModel.create({
      title: definition.title,
      participantIds: participants.map((participant) => participant._id),
    })

    let lastMessageAt: Date | null = null

    for (const message of definition.messages) {
      const sender = pick(users, message.senderIndex, 'user')

      // Created one by one so the timestamps are strictly increasing and the seeded conversation
      // list has a meaningful order.
      const created = await MessageModel.create({
        conversationId: conversation._id,
        senderId: sender._id,
        body: message.body,
      })

      lastMessageAt = created.createdAt
    }

    if (lastMessageAt !== null) {
      // Goes through the driver directly: Mongoose would otherwise stamp its own `updatedAt` on the
      // update and every conversation would end up with the same "last activity" time.
      await ConversationModel.collection.updateOne(
        { _id: conversation._id },
        { $set: { updatedAt: lastMessageAt } },
      )
    }
  }

  const [userCount, conversationCount, messageCount] = await Promise.all([
    UserModel.countDocuments(),
    ConversationModel.countDocuments(),
    MessageModel.countDocuments(),
  ])

  console.log(
    `[api] seeded ${userCount} users, ${conversationCount} conversations, ${messageCount} messages`,
  )
  console.log('[api] copy a user id from the list above into the frontend identity switcher')

  for (const user of users) {
    console.log(`      ${String(user._id)}  ${user.displayName}`)
  }

  await disconnectDatabase()
}

seed().catch((error: unknown) => {
  console.error('[api] seeding failed', error)
  process.exitCode = 1
})
