import { serve } from '@hono/node-server'
import { createApp } from './app.ts'
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

  const app = createApp(config)

  serve({ fetch: app.fetch, port: config.PORT }, (info) => {
    console.log(`zerotomvp слушает на :${info.port} (${config.NODE_ENV})`)
  })
}

main()
