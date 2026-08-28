import type { Pool } from 'pg'
import type { Env } from '../env.ts'
import type { Fetch } from '../github/oauth.ts'
import { imageState } from '../registry/catalog.ts'
import type { SigningKey } from '../registry/token.ts'
import { requestWake } from '../runtime/state.ts'
import { couldBeSandbox } from './state.ts'
import type { SandboxState } from './state.ts'

export type ResolveDeps = {
  env: Env
  pool: Pool
  signing: SigningKey
  fetchImpl?: Fetch
}

export type ResolveOptions = {
  /**
   * Обращение к адресу сэндбокса — это и запрос на его запуск. Запрос
   * состояния со страницы результата таким намерением не является.
   */
  wake?: boolean
}

/** Единственное место, где состояние сэндбокса выводится из двух реестров. */
export async function resolveSandboxState(
  deps: ResolveDeps,
  name: string,
  options: ResolveOptions = {},
): Promise<SandboxState> {
  if (!couldBeSandbox(name)) return { kind: 'unknown', name }

  const { rows } = await deps.pool.query<{
    repo_full_name: string | null
    run_status: string
  }>(
    `select repo_full_name, run_status from sandboxes
      where name = $1 and status = 'created'`,
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

  if (state === 'absent') return { kind: 'no_image', name, repoFullName }
  if (state === 'unknown') return { kind: 'indeterminate', name, repoFullName }

  // Образ есть. Если запрос пришёл на адрес сэндбокса, значит своего
  // маршрута у него ещё нет — записываем намерение поднять.
  const runStatus = options.wake
    ? ((await requestWake(deps.pool, name))?.run_status ?? row.run_status)
    : row.run_status

  switch (runStatus) {
    case 'running':
      return { kind: 'running', name, repoFullName }
    case 'failed':
      return { kind: 'failed', name, repoFullName }
    case 'starting':
      return { kind: 'starting', name, repoFullName }
    default:
      // Остановлен. По адресу мы только что попросили его поднять, поэтому
      // для посетителя это уже запуск; для страницы результата — готовность.
      return options.wake
        ? { kind: 'starting', name, repoFullName }
        : { kind: 'ready', name, repoFullName }
  }
}
