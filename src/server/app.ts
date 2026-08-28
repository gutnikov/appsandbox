import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Hono } from 'hono'
import { serveStatic } from '@hono/node-server/serve-static'
import type { Env } from './env.ts'
import { type HealthCheck, runHealthChecks } from './health.ts'

const CLIENT_DIR = './dist/client'

export type AppDeps = {
  env: Env
  healthChecks: readonly HealthCheck[]
}

export function createApp({ env, healthChecks }: AppDeps) {
  const app = new Hono()

  app.get('/healthz', async (c) => {
    const report = await runHealthChecks(healthChecks)
    return c.json(report, report.status === 'ok' ? 200 : 503)
  })

  // Сюда позже встанут роуты авторизации, создания сэндбокса и выдачи прав реестру.
  const api = new Hono()
  app.route('/api', api)

  // Неизвестный путь под /api — это ошибка API, а не заявка на клиентский маршрут.
  app.all('/api/*', (c) => c.json({ error: 'not_found' }, 404))

  if (env.NODE_ENV === 'production') {
    app.use('/*', serveStatic({ root: CLIENT_DIR }))

    // Клиентская маршрутизация: любой оставшийся GET отдаёт бандл,
    // иначе прямой переход на /created вернул бы 404.
    const indexHtml = readFileSync(join(CLIENT_DIR, 'index.html'), 'utf8')
    app.get('*', (c) => c.html(indexHtml))
  }

  return app
}
