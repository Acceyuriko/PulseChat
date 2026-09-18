import type { ApolloServer } from '@apollo/server'
import { expressMiddleware } from '@as-integrations/express5'
import cors from 'cors'
import express, { type Express } from 'express'

import { env } from './config/env.js'
import { buildContext, type GraphQLContext } from './graphql/context.js'

/**
 * Builds the Express app without binding a port, so tests can drive it through `supertest` and
 * `index.ts` stays a thin composition root.
 */
export function createApp(apolloServer: ApolloServer<GraphQLContext>): Express {
  const app = express()

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
