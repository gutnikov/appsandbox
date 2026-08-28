import type { MiddlewareHandler } from 'hono'
import { renderStatusPage } from '../sandbox-status/page.ts'
import { sandboxNameFromHost } from '../sandbox-status/state.ts'
import { type ResolveDeps, resolveSandboxState } from '../sandbox-status/resolve.ts'

export type SandboxHostDeps = ResolveDeps

/**
 * Поддомены зоны отдаются под сэндбоксы. Пока у сэндбокса нет своего
 * маршрута, запрос доходит сюда, и человек должен увидеть состояние, а не
 * лендинг платформы и не ошибку.
 */
export function sandboxHostMiddleware(deps: SandboxHostDeps): MiddlewareHandler {
  const apexHost = new URL(deps.env.PUBLIC_BASE_URL).host

  return async (c, next) => {
    const host = c.req.header('host')
    const name = host ? sandboxNameFromHost(host, apexHost) : undefined
    if (!name) return next()

    const state = await resolveSandboxState(deps, name)

    // 404 для несуществующего имени, 200 для существующего, но не запущенного:
    // во втором случае адрес закреплён, просто пока пуст.
    return c.html(renderStatusPage(state, apexHost), state.kind === 'unknown' ? 404 : 200)
  }
}
