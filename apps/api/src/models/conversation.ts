import { Schema, model } from 'mongoose'

/**
 * See the note in `user.ts`: the timestamp paths are declared explicitly so the inferred document
 * type matches what Mongoose actually returns, but without `required` — validators run before the
 * timestamps plugin writes the values.
 */
const conversationSchema = new Schema(
  {
    kind: { type: String, required: true, enum: ['CHANNEL', 'DM'] },
    /**
     * Required for a `CHANNEL`, null for a `DM`. The client labels a DM with the other member's
     * display name, so storing a title for it would be a second, competing source of truth.
     */
    title: { type: String, default: null, trim: true, maxlength: 120 },
    /**
     * Replaces the old `participantIds: [ObjectId]`. The read cursor lives next to the membership
     * so the unread count is derivable from one document instead of a parallel progress table.
     */
    members: {
      type: [
        new Schema(
          {
            userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
            lastReadAt: { type: Date, default: null },
          },
          { _id: false },
        ),
      ],
      required: true,
      validate: {
        validator: (members: unknown[]) => members.length > 0,
        message: 'A conversation needs at least one member',
      },
    },
    createdAt: { type: Date },
    updatedAt: { type: Date },
  },
  { timestamps: true, collection: 'conversations' },
)

/**
 * Backs two hot paths: `find({ 'members.userId': me })` for the list, and the per-conversation
 * membership check that authorises every read and write.
 */
conversationSchema.index({ 'members.userId': 1, updatedAt: -1 })

export const ConversationModel = model('Conversation', conversationSchema)
