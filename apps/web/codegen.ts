import type { CodegenConfig } from '@graphql-codegen/cli'

/**
 * Client-side codegen.
 *
 * Same schema as the API (read from `packages/shared/schema`), but the output is scoped to this app
 * and generated with the `client` preset, which types each operation together with its variables.
 *
 * Note the `DateTime` scalar: on the server it is a JavaScript `Date`, but over the wire it is an
 * ISO-8601 **string**. Mapping it per side is what keeps both ends honest.
 */
const config: CodegenConfig = {
  schema: '../../packages/shared/schema/**/*.graphql',
  documents: ['src/**/*.{ts,tsx}', '!src/gql/**/*'],
  generates: {
    './src/gql/': {
      preset: 'client',
      config: {
        scalars: {
          DateTime: 'string',
        },
        useTypeImports: true,
        /**
         * `enumsAsTypes` keeps `kind` a string union (`'CHANNEL' | 'DM'`) rather than a generated
         * enum object. It is what makes `conversation.kind === 'DM'` narrow correctly in a
         * component, and it avoids emitting a runtime enum that both apps would then import.
         *
         * Note that `__typename` is *not* configured here even though Apollo's cache always stores
         * it: the `client` preset defaults to `skipTypename`, so it has to be selected explicitly in
         * the documents under `src/graphql.ts`. See the comment there.
         */
        enumsAsTypes: true,
      },
      presetConfig: {
        fragmentMasking: {
          unmaskFunctionName: 'getFragmentData',
        },
      },
    },
  },
  ignoreNoDocuments: true,
}

export default config
