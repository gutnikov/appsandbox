import type { Pool } from 'pg'
import type { Env } from '../env.ts'
import type { Fetch } from '../github/oauth.ts'
import { imageState } from '../registry/catalog.ts'
import type { SigningKey } from '../registry/token.ts'
import { couldBeSandbox } from './state.ts'
import type { SandboxState } from './state.ts'

export type ResolveDeps = {
  env: Env
  pool: Pool
  signing: SigningKey
  fetchImpl?: Fetch
}

/** Единственное место, где состояние сэндбокса выводится из двух реестров. */
export async function resolveSandboxState(
  deps: ResolveDeps,
  name: string,
): Promise<SandboxState> {
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
