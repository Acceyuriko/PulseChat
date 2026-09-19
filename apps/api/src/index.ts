import { createServer } from 'node:http'

import { createApp } from './app.js'
import { env } from './config/env.js'
import { connectDatabase, disconnectDatabase } from './db/connection.js'
import { createApolloServer } from './graphql/apollo.js'
import { attachRealtime, type RealtimeEmitter } from './realtime/server.js'

async function main(): Promise<void> {
  // Fail fast: a chat backend that boots without persistence breaks in a far more confusing way.
  await connectDatabase()

  // One HTTP server for both GraphQL (HTTP) and socket.io (WebSocket + polling fallback).
  const httpServer = createServer()

  const apolloServer = createApolloServer(httpServer)
  await apolloServer.start()

  /**
   * **Mount the Express app before attaching socket.io. The order is load-bearing.**
   *
   * socket.io's `attach` snapshots `server.listeners('request')` at call time, removes them, and
   * installs its own dispatcher that replays the snapshot for every path except `/socket.io/**`.
   * A listener added afterwards is not in that snapshot, so it stays a second, independent listener
   * and handles `/socket.io/**` too — two responders on one request.
   *
   * The emitter is resolved through a thunk because it does not exist until `attachRealtime` has
   * run. That thunk is only ever called from a resolver, long after this function returns.
   */
  const realtime: { emitter: RealtimeEmitter | null } = { emitter: null }

  httpServer.on(
    'request',
    createApp(apolloServer, {
      emitter: () => {
        if (realtime.emitter === null) {
          throw new Error('The realtime layer emitted before it was attached')
        }

        return realtime.emitter
      },
    }),
  )

  realtime.emitter = attachRealtime(httpServer, { corsOrigin: env.corsOrigin }).emitter

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
