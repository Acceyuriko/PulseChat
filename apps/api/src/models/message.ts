import { Schema, model } from 'mongoose'

/**
 * See the note in `user.ts`: the timestamp paths are declared explicitly so the inferred document
 * type matches what Mongoose actually returns.
 */
const messageSchema = new Schema(
  {
    conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
    senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    body: { type: String, required: true, trim: true, maxlength: 4_000 },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
  },
  { timestamps: true, collection: 'messages' },
)

// The hot path: "newest N messages of this conversation".
messageSchema.index({ conversationId: 1, createdAt: -1 })

export const MessageModel = model('Message', messageSchema)
