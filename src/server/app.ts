import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Hono } from 'hono'
import { serveStatic } from '@hono/node-server/serve-static'
import type { Env } from './env.ts'
import { type HealthCheck, runHealthChecks } from './health.ts'
import { type Provision, createAuthRoutes } from './routes/auth.ts'
import type { MiddlewareHandler } from 'hono'
import type { Fetch } from './github/oauth.ts'

const DEFAULT_CLIENT_DIR = './dist/client'

export type AppDeps = {
  env: Env
  healthChecks: readonly HealthCheck[]
  provision: Provision
  /** Роуты выдачи прав реестру образов. Без них приложение тоже поднимается. */
  registryRoutes?: Hono
  /** Обработчик поддоменов сэндбоксов. Без него поддомены получают лендинг. */
  sandboxHost?: MiddlewareHandler
  /** Каталог собранного клиента. Подменяется в тестах. */
  clientDir?: string
  fetchImpl?: Fetch
}

export function createApp({
  env,
  healthChecks,
  provision,
  registryRoutes,
  sandboxHost,
  clientDir = DEFAULT_CLIENT_DIR,
  fetchImpl,
}: AppDeps) {
  const app = new Hono()

  app.get('/healthz', async (c) => {
    const report = await runHealthChecks(healthChecks)
    return c.json(report, report.status === 'ok' ? 200 : 503)
  })

  // После /healthz намеренно: проверка готовности должна отвечать при любом
  // заголовке Host, иначе health-check прокси сломает выкат.
  if (sandboxHost) app.use('*', sandboxHost)

  const api = new Hono()

  // Апекс, на поддоменах которого живут сэндбоксы. Клиент не должен его
  // угадывать: адрес сэндбокса — это обещание пользователю.
  api.get('/config', (c) => c.json({ sandboxHost: new URL(env.PUBLIC_BASE_URL).host }))

  api.route('/auth', createAuthRoutes({ env, provision, fetchImpl }))
  if (registryRoutes) api.route('/registry', registryRoutes)
  app.route('/api', api)

  // Неизвестный путь под /api — это ошибка API, а не заявка на клиентский маршрут.
  app.all('/api/*', (c) => c.json({ error: 'not_found' }, 404))

  if (env.NODE_ENV === 'production') {
    app.use('/*', serveStatic({ root: clientDir }))

    // Ассета с таким именем нет — значит это устаревшая ссылка, а не
    // клиентский маршрут. Отдавать здесь HTML со статусом 200 нельзя:
    // браузер со старой закешированной страницей получил бы разметку
    // вместо модуля и сломался бы молча вместо честной ошибки.
    app.all('/assets/*', (c) => c.text('not found', 404))

    // Клиентская маршрутизация: любой оставшийся GET отдаёт бандл,
    // иначе прямой переход на /created вернул бы 404.
    const indexHtml = readFileSync(join(clientDir, 'index.html'), 'utf8')
    app.get('*', (c) => c.html(indexHtml))
  }

  return app
}
