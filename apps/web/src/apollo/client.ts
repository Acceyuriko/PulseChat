import { ApolloClient, HttpLink, InMemoryCache } from '@apollo/client'

const graphqlUrl = import.meta.env.VITE_GRAPHQL_URL ?? 'http://localhost:4000/graphql'

/**
 * The scaffold's identity is the `x-user-id` header, so the client is rebuilt whenever the
 * selected identity changes. That also throws away the previous user's cache, which is exactly the
 * behaviour we want — an identity switch should never show stale data from someone else.
 *
 * With real authentication this becomes a single client plus an auth link that injects the current
 * token.
 */
export function createApolloClient(userId: string | null): ApolloClient {
  return new ApolloClient({
    link: new HttpLink({
      uri: graphqlUrl,
      headers: userId === null ? {} : { 'x-user-id': userId },
    }),
    cache: new InMemoryCache(),
  })
}
