import { defineConfig } from 'vitest/config'

// Kept separate from vite.config.ts so the PWA and React plugins don't load for
// what are plain TypeScript unit tests.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
