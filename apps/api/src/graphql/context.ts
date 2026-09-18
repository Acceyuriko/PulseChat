import { isValidObjectId } from 'mongoose'

import { UserModel } from '../models/user.js'
import { type HeaderBag, readIdentityHeader } from './identity.js'
import { type UserDTO, toUser } from './mappers.js'

export interface GraphQLContext {
  /** `null` when the request carried no identity, or carried one that no longer exists. */
  currentUser: UserDTO | null
}

interface ExpressLikeRequest {
  headers: HeaderBag
}

/**
 * Built once per request and shared by every resolver in that request.
 *
 * Because `currentUser` is nullable, a resolver states its own requirement: `requireUser()` throws
 * when it needs an identity, while a public query can simply ignore the field. Unknown users are
 * treated as "not authenticated" rather than as an error, so the two cases stay distinguishable.
 */
export async function buildContext({ req }: { req: ExpressLikeRequest }): Promise<GraphQLContext> {
  const userId = readIdentityHeader(req.headers)

  if (userId === null || !isValidObjectId(userId)) {
    return { currentUser: null }
  }

  const doc = await UserModel.findById(userId).exec()

  return { currentUser: doc === null ? null : toUser(doc) }
}
