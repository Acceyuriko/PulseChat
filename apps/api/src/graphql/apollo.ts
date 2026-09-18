import type { Server as HttpServer } from 'node:http'

import { ApolloServer } from '@apollo/server'
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer'
import { readTypeDefs } from '@pulsechat/shared'

import { isProduction } from '../config/env.js'
import type { GraphQLContext } from './context.js'
import { resolvers } from './resolvers.js'

/**
 * `ApolloServerPluginDrainHttpServer` is what makes `server.stop()` wait for in-flight requests
 * during shutdown; it needs the very same `http.Server` that socket.io is attached to.
 */
export function createApolloServer(httpServer: HttpServer): ApolloServer<GraphQLContext> {
  return new ApolloServer<GraphQLContext>({
    typeDefs: readTypeDefs(),
    resolvers,
    // The landing page / schema introspection is a development affordance, not a production one.
    introspection: !isProduction,
    /**
     * Stack traces carry absolute paths from the machine that threw, so they are a leak, not a
     * detail. Apollo already defaults to omitting them outside development, but this is stated
     * rather than inherited: in development the trace points straight at the resolver that threw.
     */
    includeStacktraceInErrorResponses: !isProduction,
    plugins: [ApolloServerPluginDrainHttpServer({ httpServer })],
  })
}
