import type { Pool } from 'pg'
import { generateName, isValidSandboxName } from './names.ts'

/** Код ошибки Postgres для нарушения уникального индекса. */
const UNIQUE_VIOLATION = '23505'

/** Сколько имён пробуем, прежде чем сдаться. */
export const MAX_RESERVE_ATTEMPTS = 8

/** С какой попытки начинаем добавлять случайный хвост к имени. */
const SUFFIX_FROM_ATTEMPT = 4

export type SandboxRow = {
  name: string
  status: 'reserved' | 'created'
  github_login: string
  repo_full_name: string | null
  repo_url: string | null
  created_at: Date
  provisioned_at: Date | null
}

export class NameExhaustedError extends Error {
  readonly attempts: number

  constructor(attempts: number) {
    super(`Не удалось подобрать свободное имя за ${attempts} попыток`)
    this.name = 'NameExhaustedError'
    this.attempts = attempts
  }
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error &&
    (error as { code?: string }).code === UNIQUE_VIOLATION
}

export type ReserveOptions = {
  /** Подмена генератора имён в тестах. */
  nextName?: (attempt: number) => string
  maxAttempts?: number
}

/**
 * Резервирует имя до обращения к GitHub.
 *
 * Уникальность обеспечивает индекс в базе, а не проверка перед вставкой:
 * только так корректно разрешается гонка двух одновременных запросов.
 */
export async function reserveName(
  pool: Pool,
  githubLogin: string,
  options: ReserveOptions = {},
): Promise<string> {
  const maxAttempts = options.maxAttempts ?? MAX_RESERVE_ATTEMPTS
  const nextName =
    options.nextName ??
    ((attempt: number) => generateName({ suffix: attempt >= SUFFIX_FROM_ATTEMPT }))

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const name = nextName(attempt)
    if (!isValidSandboxName(name)) {
      throw new Error(`Сгенерировано некорректное имя сэндбокса: ${name}`)
    }

    try {
      await pool.query(
        'insert into sandboxes (name, github_login) values ($1, $2)',
        [name, githubLogin],
      )
      return name
    } catch (error) {
      if (isUniqueViolation(error)) continue
      throw error
    }
  }

  throw new NameExhaustedError(maxAttempts)
}

/**
 * Снимает резерв. Вызывается, когда репозиторий создать не удалось: реестр не
 * должен содержать имён, за которыми не стоит существующий репозиторий.
 */
export async function releaseName(pool: Pool, name: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `delete from sandboxes where name = $1 and status = 'reserved'`,
    [name],
  )
  return (rowCount ?? 0) > 0
}

/** Отмечает, что за именем встал реально созданный репозиторий. */
export async function markProvisioned(
  pool: Pool,
  name: string,
  repo: { fullName: string; url: string },
): Promise<SandboxRow> {
  const { rows } = await pool.query<SandboxRow>(
    `update sandboxes
        set status = 'created',
            repo_full_name = $2,
            repo_url = $3,
            provisioned_at = now()
      where name = $1 and status = 'reserved'
      returning name, status, github_login, repo_full_name, repo_url, created_at, provisioned_at`,
    [name, repo.fullName, repo.url],
  )

  const row = rows[0]
  if (!row) throw new Error(`Нет зарезервированного сэндбокса с именем ${name}`)
  return row
}

/** Поиск по репозиторию — нужен реестру образов для сверки OIDC-удостоверений. */
export async function findByRepoFullName(
  pool: Pool,
  repoFullName: string,
): Promise<SandboxRow | undefined> {
  const { rows } = await pool.query<SandboxRow>(
    `select name, status, github_login, repo_full_name, repo_url, created_at, provisioned_at
       from sandboxes
      where repo_full_name = $1 and status = 'created'`,
    [repoFullName],
  )
  return rows[0]
}
