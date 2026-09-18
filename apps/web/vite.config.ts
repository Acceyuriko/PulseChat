import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

/**
 * 4173, not Vite's default 5173: 5173 is the single most contended port on a developer machine —
 * every other Vite project claims it. `strictPort` then makes a collision a loud failure instead
 * of a silent move to 5174, which would contradict the API's CORS origin and surface as an opaque
 * CORS error rather than "the port was taken".
 *
 * Override with `WEB_PORT` when 4173 is busy too.
 */
const port = Number.parseInt(process.env.WEB_PORT ?? '4173', 10)

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port,
    strictPort: true,
  },
  preview: {
    port,
    strictPort: true,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    // Styling is irrelevant to behaviour, so the CSS pipeline is skipped in tests.
    css: false,
  },
})
