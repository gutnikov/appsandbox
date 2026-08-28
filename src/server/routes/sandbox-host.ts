import type { MiddlewareHandler } from 'hono'
import type { Pool } from 'pg'
import { imageState } from '../registry/catalog.ts'
import type { SigningKey } from '../registry/token.ts'
import type { Env } from '../env.ts'
import type { Fetch } from '../github/oauth.ts'
import { renderStatusPage } from '../sandbox-status/page.ts'
import { couldBeSandbox, sandboxNameFromHost } from '../sandbox-status/state.ts'
import type { SandboxState } from '../sandbox-status/state.ts'

export type SandboxHostDeps = {
  env: Env
  pool: Pool
  signing: SigningKey
  fetchImpl?: Fetch
}

async function resolveState(deps: SandboxHostDeps, name: string): Promise<SandboxState> {
  if (!couldBeSandbox(name)) return { kind: 'unknown', name }

  const { rows } = await deps.pool.query<{ repo_full_name: string | null }>(
    `select repo_full_name from sandboxes where name = $1 and status = 'created'`,
    [name],
  )
  const row = rows[0]
  if (!row) return { kind: 'unknown', name }

  const repoFullName = row.repo_full_name
  const state = await imageState(
    {
      signing: deps.signing,
      issuer: deps.env.PUBLIC_BASE_URL,
      service: deps.env.REGISTRY_HOST,
      baseUrl: deps.env.REGISTRY_INTERNAL_URL,
      ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
    },
    name,
  )

  if (state === 'present') return { kind: 'ready', name, repoFullName }
  if (state === 'absent') return { kind: 'no_image', name, repoFullName }
  return { kind: 'indeterminate', name, repoFullName }
}

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

    const state = await resolveState(deps, name)

    // 404 для несуществующего имени, 200 для существующего, но не запущенного:
    // во втором случае адрес закреплён, просто пока пуст.
    return c.html(renderStatusPage(state, apexHost), state.kind === 'unknown' ? 404 : 200)
  }
}
