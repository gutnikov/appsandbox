import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['./vitest.setup.ts'],
    // Интеграционные тесты делят одну таблицу, поэтому файлы не параллелятся.
    fileParallelism: false,
  },
})
