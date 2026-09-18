import { Schema, model } from 'mongoose'

/**
 * See the note in `user.ts`: the timestamp paths are declared explicitly so the inferred document
 * type matches what Mongoose actually returns, but without `required` — validators run before the
 * timestamps plugin writes the values.
 */
const conversationSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    participantIds: {
      type: [{ type: Schema.Types.ObjectId, ref: 'User' }],
      required: true,
      validate: {
        validator: (ids: unknown[]) => ids.length > 0,
        message: 'A conversation needs at least one participant',
      },
    },
    createdAt: { type: Date },
    updatedAt: { type: Date },
  },
  { timestamps: true, collection: 'conversations' },
)

// Supports `find({ participantIds: me })` in the conversations resolver.
conversationSchema.index({ participantIds: 1, updatedAt: -1 })

export const ConversationModel = model('Conversation', conversationSchema)
