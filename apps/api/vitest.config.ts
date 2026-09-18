import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // The integration suite probes the database on start-up and skips itself when it is unreachable.
    testTimeout: 15_000,
  },
})
