import type { Pool } from 'pg'
import type { Fetch } from '../github/oauth.ts'
import { issueRegistryToken, type SigningKey } from '../registry/token.ts'

/** Сколько последних образов сэндбокса держим в реестре. */
export const KEEP_IMAGES = 3

export type ImagesDeps = {
  pool: Pool
  signing: SigningKey
  issuer: string
  service: string
  baseUrl: string
  fetchImpl?: Fetch
}

/** Запоминает публикацию. Повторное уведомление о том же образе безвредно. */
export async function recordImage(pool: Pool, name: string, digest: string): Promise<void> {
  await pool.query(
    `insert into sandbox_images (sandbox_name, digest) values ($1, $2)
     on conflict (sandbox_name, digest) do nothing`,
    [name, digest],
  )
}

type Prunable = { sandbox_name: string; digest: string }

/**
 * Образы, которые можно удалить: всё, что старше последних KEEP_IMAGES и не
 * используется прямо сейчас. Текущий образ не удаляется никогда, даже если
 * он старый: из него запущен или будет запущен сэндбокс.
 */
async function prunable(pool: Pool): Promise<Prunable[]> {
  const { rows } = await pool.query<Prunable>(
    `with ranked as (
       select i.sandbox_name, i.digest,
              row_number() over (partition by i.sandbox_name order by i.pushed_at desc) as age,
              s.desired_image_digest, s.running_image_digest
         from sandbox_images i
         join sandboxes s on s.name = i.sandbox_name
     )
     select sandbox_name, digest
       from ranked
      where age > $1
        and digest is distinct from desired_image_digest
        and digest is distinct from running_image_digest`,
    [KEEP_IMAGES],
  )
  return rows
}

async function pullToken(deps: ImagesDeps, name: string): Promise<string> {
  const { token } = await issueRegistryToken({
    signing: deps.signing,
    issuer: deps.issuer,
    service: deps.service,
    subject: 'platform',
    // Для удаления манифеста реестру нужно именно это право.
    access: [{ type: 'repository', name, actions: ['pull', 'delete'] }],
    ttlSeconds: 60,
  })
  return token
}

export type PruneResult = { deleted: number; failed: number }

export async function pruneImages(deps: ImagesDeps): Promise<PruneResult> {
  const fetchImpl = deps.fetchImpl ?? fetch
  const result: PruneResult = { deleted: 0, failed: 0 }

  for (const item of await prunable(deps.pool)) {
    const token = await pullToken(deps, item.sandbox_name)

    let ok = false
    try {
      const response = await fetchImpl(
        `${deps.baseUrl}/v2/${item.sandbox_name}/manifests/${item.digest}`,
        { method: 'DELETE', headers: { authorization: `Bearer ${token}` } },
      )
      // 404 значит, что в реестре его уже нет — запись всё равно лишняя.
      ok = response.status === 202 || response.status === 404
    } catch {
      ok = false
    }

    if (!ok) {
      result.failed += 1
      continue
    }

    await deps.pool.query('delete from sandbox_images where sandbox_name = $1 and digest = $2', [
      item.sandbox_name,
      item.digest,
    ])
    result.deleted += 1
  }

  return result
}
