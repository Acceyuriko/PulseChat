import { createServer } from 'node:http'

import { createApp } from './app.js'
import { env } from './config/env.js'
import { connectDatabase, disconnectDatabase } from './db/connection.js'
import { createApolloServer } from './graphql/apollo.js'
import { attachRealtime } from './realtime/server.js'

async function main(): Promise<void> {
  // Fail fast: a chat backend that boots without persistence breaks in a far more confusing way.
  await connectDatabase()

  // One HTTP server for both GraphQL (HTTP) and socket.io (WebSocket + polling fallback).
  const httpServer = createServer()

  const apolloServer = createApolloServer(httpServer)
  await apolloServer.start()

  httpServer.on('request', createApp(apolloServer))
  attachRealtime(httpServer, { corsOrigin: env.corsOrigin })

  await new Promise<void>((resolve) => {
    httpServer.listen({ port: env.port }, resolve)
  })

  console.log(`[api] GraphQL  http://localhost:${env.port}/graphql`)
  console.log(`[api] health   http://localhost:${env.port}/health`)
  console.log(`[api] realtime ws://localhost:${env.port}  (socket.io)`)

  let shuttingDown = false

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) {
      return
    }
    shuttingDown = true

    console.log(`[api] ${signal} received, shutting down`)

    await apolloServer.stop()
    await disconnectDatabase()
  }

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      void shutdown(signal)
    })
  }
}

main().catch((error: unknown) => {
  console.error('[api] failed to start', error)
  process.exitCode = 1
})
