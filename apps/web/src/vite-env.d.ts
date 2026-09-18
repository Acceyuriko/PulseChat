/// <reference types="vite/client" />

/**
 * Narrows the `any` that `vite/client` gives to `import.meta.env`: without this, every `VITE_*`
 * read is typed `any` and the type-aware lint rules correctly flag each use of it.
 */
interface ImportMetaEnv {
  readonly VITE_GRAPHQL_URL?: string
  readonly VITE_REALTIME_URL?: string
}
