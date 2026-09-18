import { Types } from 'mongoose'

import { connectDatabase, disconnectDatabase } from '../db/connection.js'
import { letterAvatarDataUri } from '../domain/avatar.js'
import { buildQuoteSnapshot } from '../domain/quote.js'
import { ConversationModel } from '../models/conversation.js'
import { MessageModel } from '../models/message.js'
import { UserModel } from '../models/user.js'

/**
 * Seeds the design's conversation list (docs/plans/chat-features.md, module 38).
 *
 * The shape is taken from Appendix A of the plan: eight rows, the two unread badges of 3 and 6,
 * a mix of group conversations and DMs, one message carrying a quote and one carrying a mention.
 *
 * Two rules from the design are encoded in this data and deliberately nowhere else:
 *   - a channel preview is prefixed with the sender's name, a DM preview is not;
 *   - a channel shows a collage of member avatars, a DM shows a single one.
 *
 * The `[File]` / `[Photo]` previews are literal text. They are here because the design shows them,
 * not because uploads exist — see Appendix B, risk 4.
 */

interface SeedUser {
  displayName: string
  title: string
}

interface SeedMessage {
  /** Display name of the sender; resolved to an id once the users exist. */
  from: string
  body: string
  /** Display name of the author of the quoted message, when this message quotes one. */
  replyToFrom?: string
  /** Index of the quoted message within this conversation's own message list. */
  replyToIndex?: number
  /** Age of the message in minutes, counted back from seed time. */
  minutesAgo: number
}

interface SeedConversation {
  kind: 'CHANNEL' | 'DM'
  title: string | null
  memberNames: string[]
  messages: SeedMessage[]
  /**
   * Names whose read cursor stays at the very beginning, which is what makes the unread badge
   * non-zero. Everyone else is marked as having read up to just before the newest message.
   */
  unreadFor?: string[]
}

const SEED_USERS: SeedUser[] = [
  { displayName: 'Jerry Wilson', title: 'Product Manager@Acme' },
  { displayName: 'Allen Smith', title: 'Design Lead@Acme' },
  { displayName: 'Tim Johnson', title: 'Staff Engineer@Acme' },
  { displayName: 'Eric Chen', title: 'Data Scientist@Acme' },
  { displayName: 'Grace Hopper', title: 'Engineering Manager@Acme' },
  { displayName: 'Lynne Foster', title: 'CTO@Apple' },
  { displayName: 'Courtney Henry', title: 'Marketing Director@Acme' },
  { displayName: 'Albert Flores', title: 'Support Lead@Acme' },
  { displayName: 'Darlene Robertson', title: 'Head of Ops@Acme' },
  { displayName: 'Darrell Steward', title: 'CTO@Apple' },
  { displayName: 'Devon Lane', title: 'VP Engineering@Acme' },
]

const SEED_CONVERSATIONS: SeedConversation[] = [
  {
    kind: 'CHANNEL',
    title: 'Announcements',
    memberNames: ['Jerry Wilson', 'Allen Smith', 'Tim Johnson', 'Devon Lane'],
    unreadFor: ['Jerry Wilson'],
    messages: [
      { from: 'Allen Smith', body: 'Welcome to the community everyone 👋', minutesAgo: 2880 },
      { from: 'Devon Lane', body: 'Excited to be here.', minutesAgo: 1440 },
      {
        from: 'Jerry Wilson',
        body: 'Sharing the onboarding packet — see the attached guideline for the rollout schedule.',
        minutesAgo: 180,
      },
      { from: 'Allen Smith', body: '[File] Design Guideline.pdf', minutesAgo: 150 },
    ],
  },
  {
    kind: 'CHANNEL',
    title: 'Share your story',
    memberNames: ['Allen Smith', 'Courtney Henry', 'Albert Flores'],
    unreadFor: ['Allen Smith'],
    messages: [
      {
        from: 'Courtney Henry',
        body: 'I moved into marketing from support three years ago.',
        minutesAgo: 4300,
      },
      {
        from: 'Albert Flores',
        body: 'That is a great path — what made you switch?',
        minutesAgo: 4200,
      },
      {
        from: 'Courtney Henry',
        body: 'I wanted to work closer to the customers’ voice.',
        minutesAgo: 4150,
      },
      { from: 'Allen Smith', body: '[Photo]', minutesAgo: 300 },
    ],
  },
  {
    kind: 'CHANNEL',
    title: 'General',
    memberNames: ['Tim Johnson', 'Grace Hopper', 'Devon Lane', 'Jerry Wilson'],
    messages: [
      {
        from: 'Grace Hopper',
        body: 'Anyone tried the new GraphQL federation tooling?',
        minutesAgo: 1200,
      },
      { from: 'Devon Lane', body: 'Not yet — waiting for the 5.x release.', minutesAgo: 1150 },
      {
        from: 'Tim Johnson',
        body: 'If you want to learn more about how subscriptions behave under load, the docs finally have a section on it.',
        minutesAgo: 90,
      },
    ],
  },
  {
    kind: 'CHANNEL',
    title: 'Design product',
    memberNames: ['Eric Chen', 'Allen Smith', 'Courtney Henry'],
    messages: [
      {
        from: 'Allen Smith',
        body: 'Pushed the updated tokens to the shared library.',
        minutesAgo: 700,
      },
      { from: 'Eric Chen', body: 'The dark palette reads much better now.', minutesAgo: 660 },
      { from: 'Eric Chen', body: 'Yeah I know 🫢', minutesAgo: 120 },
    ],
  },
  {
    kind: 'CHANNEL',
    title: 'Product team',
    memberNames: ['Grace Hopper', 'Lynne Foster', 'Devon Lane', 'Tim Johnson'],
    messages: [
      { from: 'Devon Lane', body: 'Standup is moving to 9:30 from Monday.', minutesAgo: 500 },
      {
        from: 'Lynne Foster',
        body: 'Works for me.',
        replyToFrom: 'Devon Lane',
        replyToIndex: 0,
        minutesAgo: 480,
      },
      { from: 'Grace Hopper', body: 'Same here.', minutesAgo: 60 },
    ],
  },
  {
    kind: 'DM',
    title: null,
    memberNames: ['Jerry Wilson', 'Courtney Henry'],
    messages: [
      {
        from: 'Courtney Henry',
        body: 'Did you get a chance to look at the brief?',
        minutesAgo: 240,
      },
      { from: 'Jerry Wilson', body: 'Yes — it is solid.', minutesAgo: 220 },
      { from: 'Courtney Henry', body: "So, what's your plan this weekend?", minutesAgo: 45 },
    ],
  },
  {
    kind: 'DM',
    title: null,
    memberNames: ['Jerry Wilson', 'Albert Flores'],
    messages: [
      { from: 'Albert Flores', body: 'Ticket queue is down to four open items.', minutesAgo: 180 },
      { from: 'Jerry Wilson', body: 'Nice work.', minutesAgo: 170 },
      { from: 'Albert Flores', body: "What's the progress on that task?", minutesAgo: 30 },
    ],
  },
  {
    kind: 'DM',
    title: null,
    memberNames: ['Jerry Wilson', 'Darlene Robertson'],
    messages: [
      {
        from: 'Darlene Robertson',
        body: 'The quarterly numbers are in the shared drive.',
        minutesAgo: 150,
      },
      {
        from: 'Jerry Wilson',
        body: 'Thanks — I will take a look this afternoon.',
        minutesAgo: 140,
      },
      { from: 'Darlene Robertson', body: "Yeah! You're right.", minutesAgo: 20 },
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

/** A seeded user with the fields this script needs; `_id` is an ObjectId at runtime. */
type SeededUser = Awaited<ReturnType<typeof UserModel.create>>[number] & { _id: Types.ObjectId }

/** Resolves a display name to a user, failing loudly on a typo in the tables above. */
function userByName(users: Map<string, SeededUser>, name: string): SeededUser {
  const user = users.get(name)

  if (user === undefined) {
    throw new Error(`Seed data references unknown user "${name}"`)
  }

  return user
}

async function seed(): Promise<void> {
  await connectDatabase()

  await Promise.all([
    UserModel.deleteMany({}),
    ConversationModel.deleteMany({}),
    MessageModel.deleteMany({}),
  ])

  const users: SeededUser[] = await UserModel.create(
    SEED_USERS.map((user) => ({
      displayName: user.displayName,
      title: user.title,
      avatarUrl: letterAvatarDataUri(user.displayName),
    })),
  )

  const byName = new Map<string, SeededUser>(users.map((user) => [user.displayName, user]))

  // Anchored so every seeded timestamp is relative to the same instant, which keeps the list order
  // stable across reseeds instead of depending on how long the loop took.
  const seededAt = Date.now()

  for (const definition of SEED_CONVERSATIONS) {
    const members = definition.memberNames.map((name) => userByName(byName, name))

    const conversation = await ConversationModel.create({
      kind: definition.kind,
      title: definition.title,
      // The cursor is filled in once the messages exist and their timestamps are known.
      members: members.map((member) => ({ userId: member._id, lastReadAt: null })),
    })

    const created: {
      id: string
      senderId: string
      senderDisplayName: string
      body: string
      createdAt: Date
    }[] = []

    for (const definitionMessage of definition.messages) {
      const sender = userByName(byName, definitionMessage.from)

      let replyTo = null

      if (
        definitionMessage.replyToFrom !== undefined &&
        definitionMessage.replyToIndex !== undefined
      ) {
        const quoted = pick(created, definitionMessage.replyToIndex, 'quoted message')

        replyTo = buildQuoteSnapshot({
          id: quoted.id,
          senderId: quoted.senderId,
          senderDisplayName: quoted.senderDisplayName,
          body: quoted.body,
          createdAt: quoted.createdAt,
        })
      }

      const createdAt = new Date(seededAt - definitionMessage.minutesAgo * 60_000)

      // Created one by one so the ids referenced by a quote exist before the reply is written.
      const message = await MessageModel.create({
        conversationId: conversation._id,
        senderId: sender._id,
        body: definitionMessage.body,
        replyTo,
        createdAt,
      })

      // Written through the driver: Mongoose would otherwise stamp `updatedAt: now` on the insert
      // and every seeded message in a conversation would carry the seed run's clock rather than the
      // backdated time the list order depends on.
      await MessageModel.collection.updateOne(
        { _id: message._id },
        { $set: { createdAt, updatedAt: createdAt } },
      )

      created.push({
        id: String(message._id),
        senderId: String(sender._id),
        senderDisplayName: sender.displayName,
        body: definitionMessage.body,
        createdAt,
      })
    }

    /**
     * Read cursors.
     *
     * `unreadFor` names keep `lastReadAt: null`, which makes every message from someone else count
     * as unread — that is how the design's `3` and `6` badges are produced without storing a
     * counter. Everyone else is advanced to the second-newest message, so the newest one still
     * counts as unread for them too.
     */
    const unreadNames = new Set(definition.unreadFor ?? [])
    const secondNewest = created.at(-2)?.createdAt ?? null

    for (const member of members) {
      const isUnread = unreadNames.has(member.displayName)

      await ConversationModel.collection.updateOne(
        { _id: conversation._id, 'members.userId': member._id },
        { $set: { 'members.$.lastReadAt': isUnread ? null : secondNewest } },
      )
    }

    await ConversationModel.collection.updateOne(
      { _id: conversation._id },
      { $set: { updatedAt: created.at(-1)?.createdAt ?? new Date(seededAt) } },
    )
  }

  const [userCount, conversationCount, messageCount] = await Promise.all([
    UserModel.countDocuments(),
    ConversationModel.countDocuments(),
    MessageModel.countDocuments(),
  ])

  console.log(
    `[api] seeded ${userCount} users, ${conversationCount} conversations, ${messageCount} messages`,
  )
  console.log('[api] pick an identity below in the frontend switcher')
  console.log(
    '[api] note: identity is per browser tab (sessionStorage), so two tabs can be two users',
  )

  for (const user of users) {
    console.log(`      ${String(user._id)}  ${user.displayName}`)
  }

  await disconnectDatabase()
}

seed().catch((error: unknown) => {
  console.error('[api] seeding failed', error)
  process.exitCode = 1
})
