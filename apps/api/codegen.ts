import type { CodegenConfig } from '@graphql-codegen/cli'

/**
 * Server-side codegen.
 *
 * The schema is read from `packages/shared/schema` — the single source of truth — while the output
 * stays inside this app, so nothing is shared that the frontend does not need.
 *
 * The `mappers` option maps GraphQL object types onto the DTOs in `src/graphql/mappers.ts`. That is
 * what lets `Conversation.lastMessage` be served by a field resolver instead of being carried on
 * every conversation object.
 *
 * `ConversationMember` and `QuoteSnapshot` are mapped too, so their nested `user` / scalar fields
 * keep their real types rather than degrading to the generated placeholder shapes.
 */
const config: CodegenConfig = {
  schema: '../../packages/shared/schema/**/*.graphql',
  generates: {
    './src/generated/graphql.ts': {
      plugins: ['typescript', 'typescript-resolvers'],
      config: {
        contextType: '../graphql/context.js#GraphQLContext',
        mappers: {
          User: '../graphql/mappers.js#UserDTO',
          Message: '../graphql/mappers.js#MessageDTO',
          Conversation: '../graphql/mappers.js#ConversationDTO',
          ConversationMember: '../graphql/mappers.js#ConversationMemberDTO',
          QuoteSnapshot: '../graphql/mappers.js#QuoteSnapshotDTO',
        },
        scalars: {
          DateTime: 'Date',
        },
        strictScalars: true,
        useTypeImports: true,
        enumsAsTypes: true,
      },
    },
  },
  ignoreNoDocuments: true,
}

export default config
