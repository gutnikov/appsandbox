import { serve } from '@hono/node-server'
import { createApp } from './app.ts'
import { createPool, databaseHealthCheck } from './db/pool.ts'
import { EnvError, env } from './env.ts'

function main() {
  let config
  try {
    config = env()
  } catch (error) {
    if (error instanceof EnvError) {
      console.error(error.message)
      process.exit(1)
    }
    throw error
  }

  const pool = createPool(config.DATABASE_URL)
  const app = createApp({ env: config, healthChecks: [databaseHealthCheck(pool)] })

  const server = serve({ fetch: app.fetch, port: config.PORT }, (info) => {
    console.log(`zerotomvp слушает на :${info.port} (${config.NODE_ENV})`)
  })

  const shutdown = () => {
    server.close(() => {
      void pool.end().finally(() => process.exit(0))
    })
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}

main()
