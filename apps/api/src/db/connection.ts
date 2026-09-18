import mongoose from 'mongoose'

import { env } from '../config/env.js'

/**
 * Connects to MongoDB. The API refuses to boot without a database: a chat backend that silently
 * starts without persistence would surface the failure much later and much more confusingly.
 */
export async function connectDatabase(uri: string = env.mongodbUri): Promise<void> {
  mongoose.set('strictQuery', true)

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5_000 })

  console.log(`[api] MongoDB connected (db: ${mongoose.connection.name})`)
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect()
}
