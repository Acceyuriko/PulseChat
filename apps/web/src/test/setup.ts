import '@testing-library/jest-dom/vitest'

import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Vitest `globals` is deliberately disabled, so Testing Library cannot register
// its own auto-cleanup hook. Without this, rendered trees leak into later tests
// and queries start matching multiple elements.
afterEach(() => {
  cleanup()
})
