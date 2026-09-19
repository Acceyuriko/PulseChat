import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

const TYPESCRIPT_FILES = ['**/*.{ts,tsx}']

/**
 * Single flat config for the whole monorepo.
 *
 * Two deliberate scoping choices:
 *
 * 1. Generated GraphQL artefacts and build output are ignored — they are not hand-written source,
 *    and re-formatting them fights the generator.
 * 2. The type-aware rules only apply to TypeScript files. Config files and plain `.mjs` scripts have
 *    no tsconfig to be checked against, so including them makes the parser fail on every one of them.
 */
export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      'apps/api/src/generated/**',
      'apps/web/src/gql/**',
      'pnpm-lock.yaml',
      // Local assistant notes and probe scripts. Git and Prettier already ignore this
      // directory; ESLint is the odd one out, and the probes are browser/Node scripts that
      // no tsconfig covers.
      '.workbuddy/**',
    ],
  },

  js.configs.recommended,

  // Type-aware linting needs the type checker, and therefore a tsconfig for every linted file.
  ...tseslint.configs.recommendedTypeChecked.map((config) => ({
    ...config,
    files: TYPESCRIPT_FILES,
  })),

  {
    files: TYPESCRIPT_FILES,
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // Plain JavaScript: tooling and build scripts that run directly on Node.
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        URL: 'readonly',
      },
    },
  },

  // React rules only where React lives.
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },

  // Must stay last: switches off every rule that would fight Prettier.
  prettier,
)
