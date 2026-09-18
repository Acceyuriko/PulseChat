import { Schema, model } from 'mongoose'

/**
 * `timestamps: true` makes Mongoose maintain `createdAt` / `updatedAt`, but its TypeScript
 * inference (`InferSchemaType`) has no idea those paths exist. Declaring them explicitly — while
 * still letting Mongoose own their values — is what keeps the doc type honest at the call sites.
 *
 * They must not be marked `required`, though. Mongoose runs validators *before* the timestamps
 * plugin writes the values, so `required: true` here makes every insert fail with
 * "Path `createdAt` is required" — with no hint that the schema is the problem.
 */
const timestamps = {
  createdAt: { type: Date },
  updatedAt: { type: Date },
} as const

const userSchema = new Schema(
  {
    displayName: { type: String, required: true, trim: true, maxlength: 80 },
    avatarUrl: { type: String, default: null },
    ...timestamps,
  },
  { timestamps: true, collection: 'users' },
)

export const UserModel = model('User', userSchema)
