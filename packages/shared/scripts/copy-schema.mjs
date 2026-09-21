import { cpSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * `tsc` only emits JavaScript, so the SDL files have to be copied next to the build output.
 * `src/schema.ts` reads them from `dist/schema` at runtime.
 */
const source = fileURLToPath(new URL('../schema', import.meta.url))
const destination = fileURLToPath(new URL('../dist/schema', import.meta.url))

cpSync(source, destination, { recursive: true })

console.log(`[shared] SDL copied to ${destination}`)
