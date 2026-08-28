import type { Pool } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { migrate } from '../db/migrate.ts'
import { createPool } from '../db/pool.ts'
import type { Env } from '../env.ts'
import { MAX_PROVISION_ATTEMPTS, createProvision } from './provision.ts'

const DATABASE_URL = process.env.DATABASE_URL

const env = {
  TEMPLATE_REPO: 'gutnikov/sandbox-template',
} as Env

function nameTakenResponse() {
  return new Response(
    JSON.stringify({
      message: 'Repository creation failed.',
      errors: [{ field: 'name', message: 'name already exists on this account' }],
    }),
    { status: 422, headers: { 'content-type': 'application/json' } },
  )
}

function createdResponse(owner: string, name: string) {
  return new Response(
    JSON.stringify({
      full_name: `${owner}/${name}`,
      html_url: `https://github.com/${owner}/${name}`,
    }),
    { status: 201, headers: { 'content-type': 'application/json' } },
  )
}

describe.runIf(DATABASE_URL)('создание сэндбокса', () => {
  let pool: Pool

  beforeAll(async () => {
    pool = createPool(DATABASE_URL as string)
    await migrate(pool)
  })

  afterAll(async () => {
    await pool.end()
  })

  beforeEach(async () => {
    await pool.query('truncate sandboxes cascade')
  })

  it('порождает репозиторий и связывает его с зарезервированным именем', async () => {
    const provision = createProvision({
      pool,
      env,
      fetchImpl: (async (_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body)) as { owner: string; name: string }
        return createdResponse(body.owner, body.name)
      }) as unknown as typeof fetch,
    })

    const result = await provision({ login: 'octocat', token: 'gho_secret' })

    expect(result.name).toMatch(/^sandbox-/)
    expect(result.repoUrl).toBe(`https://github.com/octocat/${result.name}`)

    const { rows } = await pool.query('select * from sandboxes')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      name: result.name,
      status: 'created',
      github_login: 'octocat',
      repo_full_name: `octocat/${result.name}`,
    })
  })

  it('если имя занято в аккаунте пользователя, берёт другое и доводит дело до конца', async () => {
    const attempted: string[] = []
    const provision = createProvision({
      pool,
      env,
      fetchImpl: (async (_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body)) as { owner: string; name: string }
        attempted.push(body.name)
        return attempted.length === 1
          ? nameTakenResponse()
          : createdResponse(body.owner, body.name)
      }) as unknown as typeof fetch,
    })

    const result = await provision({ login: 'octocat', token: 'gho_secret' })

    expect(attempted).toHaveLength(2)
    expect(attempted[0]).not.toBe(attempted[1])
    expect(result.name).toBe(attempted[1])

    // Занятое имя не осталось висеть в реестре.
    const { rows } = await pool.query('select name, status from sandboxes')
    expect(rows).toEqual([{ name: result.name, status: 'created' }])
  })

  it('сдаётся после ограниченного числа попыток, не оставляя резервов', async () => {
    const provision = createProvision({
      pool,
      env,
      fetchImpl: (async () => nameTakenResponse()) as unknown as typeof fetch,
    })

    await expect(provision({ login: 'octocat', token: 'gho_secret' })).rejects.toMatchObject({
      name: 'NameExhaustedError',
    })

    const { rows } = await pool.query('select count(*)::int as n from sandboxes')
    expect(rows[0]?.n).toBe(0)
    expect(MAX_PROVISION_ATTEMPTS).toBeGreaterThan(1)
  })

  it('при неустранимой ошибке GitHub освобождает имя и не глотает ошибку', async () => {
    const provision = createProvision({
      pool,
      env,
      fetchImpl: (async () => new Response('{}', { status: 503 })) as unknown as typeof fetch,
    })

    await expect(provision({ login: 'octocat', token: 'gho_secret' })).rejects.toMatchObject({
      name: 'GitHubApiError',
      status: 503,
    })

    const { rows } = await pool.query('select count(*)::int as n from sandboxes')
    expect(rows[0]?.n).toBe(0)
  })

  it('токен пользователя не попадает в базу', async () => {
    const token = 'gho_secret_value_should_never_be_stored'
    const provision = createProvision({
      pool,
      env,
      fetchImpl: (async (_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body)) as { owner: string; name: string }
        return createdResponse(body.owner, body.name)
      }) as unknown as typeof fetch,
    })

    await provision({ login: 'octocat', token })

    const { rows } = await pool.query('select * from sandboxes')
    expect(JSON.stringify(rows)).not.toContain(token)
  })
})
