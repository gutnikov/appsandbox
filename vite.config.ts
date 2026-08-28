import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url))

// В dev клиент живёт на Vite, а API — в отдельном процессе Hono.
// В production тот же Hono отдаёт и API, и собранный бандл из dist/client.
const API_PREFIXES = ['/api', '/healthz']

export default defineConfig({
  plugins: [
    tanstackRouter({
      target: 'react',
      routesDirectory: 'src/client/routes',
      generatedRouteTree: 'src/client/routeTree.gen.ts',
      autoCodeSplitting: true,
    }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': r('./src/client'),
      '@shared': r('./src/shared'),
    },
  },
  server: {
    port: 5173,
    proxy: Object.fromEntries(
      API_PREFIXES.map((prefix) => [
        prefix,
        { target: 'http://localhost:3000', changeOrigin: false },
      ]),
    ),
  },
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
    sourcemap: true,
  },
})
