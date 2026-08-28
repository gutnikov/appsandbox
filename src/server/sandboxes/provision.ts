import type { Pool } from 'pg'
import type { Env } from '../env.ts'
import type { Fetch } from '../github/oauth.ts'
import { RepositoryNameTakenError, createFromTemplate } from '../github/repos.ts'
import type { Provision, ProvisionResult } from '../routes/auth.ts'
import { NameExhaustedError, markProvisioned, releaseName, reserveName } from './registry.ts'

/** Сколько раз пробуем, если имя оказалось занято уже в аккаунте пользователя. */
export const MAX_PROVISION_ATTEMPTS = 4

export type ProvisionDeps = {
  pool: Pool
  env: Env
  fetchImpl?: Fetch
}

export function createProvision({ pool, env, fetchImpl }: ProvisionDeps): Provision {
  return async ({ login, token }): Promise<ProvisionResult> => {
    for (let attempt = 1; attempt <= MAX_PROVISION_ATTEMPTS; attempt += 1) {
      // Имя резервируется до обращения к GitHub: оно глобальный поддомен,
      // и арбитром уникальности должна быть наша база.
      const name = await reserveName(pool, login)

      try {
        const repo = await createFromTemplate(
          token,
          { templateRepo: env.TEMPLATE_REPO, owner: login, name },
          fetchImpl,
        )
        await markProvisioned(pool, name, repo)
        return { name, repoUrl: repo.url }
      } catch (error) {
        // Реестр не должен содержать имён, за которыми не стоит репозиторий.
        await releaseName(pool, name)

        if (error instanceof RepositoryNameTakenError) continue
        throw error
      }
    }

    throw new NameExhaustedError(MAX_PROVISION_ATTEMPTS)
  }
}
