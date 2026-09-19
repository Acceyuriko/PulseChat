import type { ApolloServer } from '@apollo/server'
import { expressMiddleware } from '@as-integrations/express5'
import cors from 'cors'
import express, { type Express } from 'express'

import { env } from './config/env.js'
import { type GraphQLContext, createContextBuilder } from './graphql/context.js'
import type { RealtimeEmitter } from './realtime/server.js'

export interface CreateAppOptions {
  /**
   * Resolves the realtime handle mutations push through after a successful write. Omitted in tests
   * that do not exercise the socket path, in which case `NOOP_EMITTER` stands in.
   *
   * A thunk rather than the handle itself, because the app is mounted **before** socket.io is
   * attached — see the ordering note in `src/index.ts`.
   */
  emitter?: () => RealtimeEmitter
}

/**
 * Builds the Express app without binding a port, so tests can drive it through `supertest` and
 * `index.ts` stays a thin composition root.
 */
export function createApp(
  apolloServer: ApolloServer<GraphQLContext>,
  options: CreateAppOptions = {},
): Express {
  const app = express()
  const buildContext = createContextBuilder({ emitter: options.emitter })

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() })
  })

  app.use(
    '/graphql',
    cors<cors.CorsRequest>({ origin: env.corsOrigin, credentials: true }),
    express.json(),
    expressMiddleware(apolloServer, { context: buildContext }),
  )

  return app
}
