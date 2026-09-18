import { Schema, model } from 'mongoose'

/**
 * The frozen quote snapshot stored on a reply (docs/plans/chat-features.md, P5).
 *
 * A snapshot rather than a reference on purpose: no join on the read path, the card survives the
 * quoted message being deleted, and the excerpt cannot change under the reader. It never nests
 * another snapshot, so quote depth is fixed at one.
 */
const quoteSnapshotSchema = new Schema(
  {
    messageId: { type: Schema.Types.ObjectId, required: true },
    senderId: { type: Schema.Types.ObjectId, required: true },
    senderDisplayName: { type: String, required: true },
    bodyExcerpt: { type: String, required: true },
    createdAt: { type: Date, required: true },
  },
  { _id: false },
)

/**
 * See the note in `user.ts`: the timestamp paths are declared explicitly so the inferred document
 * type matches what Mongoose actually returns, but without `required` — validators run before the
 * timestamps plugin writes the values.
 */
const messageSchema = new Schema(
  {
    conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
    senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    // Markdown-subset source. The 4000 cap is a guard on the raw text, before parsing.
    body: { type: String, required: true, trim: true, maxlength: 4_000 },
    replyTo: { type: quoteSnapshotSchema, default: null },
    /**
     * Soft delete. The row stays so a reply that quotes it still resolves, and so the delete is
     * recoverable. The price is filter discipline — see `liveMessageFilter` below.
     */
    deletedAt: { type: Date, default: null },
    createdAt: { type: Date },
    updatedAt: { type: Date },
  },
  { timestamps: true, collection: 'messages' },
)

/**
 * The hot path: "newest live messages of this conversation".
 *
 * `deletedAt` is part of the key because every read filters on it — including it here is what
 * keeps the filter from turning into a collection scan.
 */
messageSchema.index({ conversationId: 1, createdAt: -1, deletedAt: 1 })

/**
 * The single choke point for excluding soft-deleted messages.
 *
 * `deletedAt` filtering is the one piece of discipline this design asks for, and forgetting it
 * once silently resurrects deleted messages. Rather than hoping every query remembers, the
 * default `find`/`findOne`/`countDocuments` path is filtered here, and a query that genuinely
 * needs deleted rows opts out explicitly with `.setOptions({ includeDeleted: true })`.
 *
 * Two things are deliberately *not* covered, because a middleware hook cannot reach them:
 * `aggregate()` (Mongoose does not run query middleware for it — the pipeline folds in
 * `LIVE_MESSAGE_MATCH` instead) and `updateOne`/`deleteOne` (which ought to address the row
 * regardless of its deleted state).
 */
declare module 'mongoose' {
  interface QueryOptions {
    /** Opt out of the default `deletedAt: null` filter. */
    includeDeleted?: boolean
  }
}

/** The hook only needs `getOptions` and `where`, neither of which the untyped `this` provides. */
interface FilterableQuery {
  getOptions: () => { includeDeleted?: boolean }
  where: (filter: Record<string, unknown>) => unknown
}

function isDeletedIncluded(this: FilterableQuery): boolean {
  return this.getOptions().includeDeleted === true
}

messageSchema.pre(/^find/, function (this: FilterableQuery) {
  if (isDeletedIncluded.call(this)) {
    return
  }

  this.where({ deletedAt: null })
})

messageSchema.pre('countDocuments', function (this: FilterableQuery) {
  if (isDeletedIncluded.call(this)) {
    return
  }

  this.where({ deletedAt: null })
})

export const MessageModel = model('Message', messageSchema)

/** Escape hatch for the few reads that must see deleted rows (quote resolution, admin paths). */
export const INCLUDE_DELETED = { includeDeleted: true } as const

/**
 * Mongo-level predicate matching "live message", for the raw aggregation pipeline where the
 * Mongoose middleware above does not apply. Same meaning, one place to change.
 */
export const LIVE_MESSAGE_MATCH = { deletedAt: null } as const
