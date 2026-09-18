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
