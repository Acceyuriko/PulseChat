import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * The `.graphql` files under `packages/shared/schema` are the single source of truth for the API
 * contract (docs/DECISIONS.md, D7):
 *
 * - the API compiles them at boot (this loader),
 * - both codegen configs read the same files from disk.
 *
 * Files are sorted so the concatenation order is deterministic; order does not affect GraphQL
 * semantics because each file only declares types or `extend`s a type declared in another file.
 */
const schemaDirectory = fileURLToPath(new URL('./schema/', import.meta.url))

export function readTypeDefs(): string {
  return readdirSync(schemaDirectory)
    .filter((fileName) => fileName.endsWith('.graphql'))
    .sort()
    .map((fileName) => readFileSync(join(schemaDirectory, fileName), 'utf8'))
    .join('\n')
}
