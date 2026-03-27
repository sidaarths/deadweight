import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Tests stub globalThis.fetch; running files concurrently causes cross-file
    // mock bleed. Sequential file execution eliminates this without affecting
    // test isolation within a file (each test has its own beforeEach/afterEach).
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      thresholds: {
        lines: 80,
        branches: 80,
        functions: 80,
        statements: 80,
      },
      include: ['src/**'],
      exclude: ['src/index.ts', 'src/server.ts'],
    },
  },
  resolve: {
    alias: { '@': '/src' },
  },
})
