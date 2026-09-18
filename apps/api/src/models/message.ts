import { Schema, model } from 'mongoose'

/**
 * See the note in `user.ts`: the timestamp paths are declared explicitly so the inferred document
 * type matches what Mongoose actually returns, but without `required` — validators run before the
 * timestamps plugin writes the values.
 */
const messageSchema = new Schema(
  {
    conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
    senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    body: { type: String, required: true, trim: true, maxlength: 4_000 },
    createdAt: { type: Date },
    updatedAt: { type: Date },
  },
  { timestamps: true, collection: 'messages' },
)

// The hot path: "newest N messages of this conversation".
messageSchema.index({ conversationId: 1, createdAt: -1 })

export const MessageModel = model('Message', messageSchema)
