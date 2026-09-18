import { isValidObjectId } from 'mongoose'

import { UserModel } from '../models/user.js'
import type { RealtimeEmitter } from '../realtime/server.js'
import { type HeaderBag, readIdentityHeader } from './identity.js'
import { type UserDTO, toUser } from './mappers.js'

/**
 * A no-op emitter, used when the API is built without a realtime layer — which is the case in
 * most tests. Keeping it here rather than making `emitter` nullable means a mutation never has to
 * write `context.emitter?.…`, so the realtime call sites stay uniform.
 */
export const NOOP_EMITTER: RealtimeEmitter = {
  messageCreated: () => {},
  messageDeleted: () => {},
  conversationActivity: () => {},
}

export interface GraphQLContext {
  /** `null` when the request carried no identity, or carried one that no longer exists. */
  currentUser: UserDTO | null
  /** Present so mutations can push over socket.io after a successful write (D4). */
  emitter: RealtimeEmitter
}

interface ExpressLikeRequest {
  headers: HeaderBag
}

export interface BuildContextOptions {
  emitter?: RealtimeEmitter
}

/**
 * Built once per request and shared by every resolver in that request.
 *
 * Because `currentUser` is nullable, a resolver states its own requirement: `requireUser()` throws
 * when it needs an identity, while a public query can simply ignore the field. Unknown users are
 * treated as "not authenticated" rather than as an error, so the two cases stay distinguishable.
 */
export function createContextBuilder(
  options: BuildContextOptions = {},
): ({ req }: { req: ExpressLikeRequest }) => Promise<GraphQLContext> {
  const emitter = options.emitter ?? NOOP_EMITTER

  return async ({ req }) => {
    const userId = readIdentityHeader(req.headers)

    if (userId === null || !isValidObjectId(userId)) {
      return { currentUser: null, emitter }
    }

    const doc = await UserModel.findById(userId).exec()

    return { currentUser: doc === null ? null : toUser(doc), emitter }
  }
}

/** Convenience wrapper for callers that have no emitter to install. */
export const buildContext = createContextBuilder()
