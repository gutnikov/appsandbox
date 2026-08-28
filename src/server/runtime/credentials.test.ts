import type { Pool } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { migrate } from '../db/migrate.ts'
import { createPool } from '../db/pool.ts'
import { environmentFor, ensureSecrets, readSecrets } from './credentials.ts'

const DATABASE_URL = process.env.DATABASE_URL
const ADMIN = 'postgres://sandboxadmin:pw@sandbox-db:5432/sandboxadmin'

describe.runIf(DATABASE_URL)('реквизиты сэндбокса', () => {
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
    await pool.query(
      `insert into sandboxes (name, status, github_login, repo_full_name, repo_url, provisioned_at)
       values ('sandbox-brisk-sail', 'created', 'gutnikov', 'gutnikov/x', 'https://github.com/x', now())`,
    )
  })

  it('создаёт реквизиты при первом обращении', async () => {
    const secrets = await ensureSecrets(pool, 'sandbox-brisk-sail')

    expect(secrets.database).toBe('sb_brisk_sail')
    expect(secrets.user).toBe('sb_brisk_sail')
    expect(secrets.password.length).toBeGreaterThan(20)
    expect(secrets.sessionSecret.length).toBeGreaterThan(20)
  })

  it('второй раз выдаёт те же самые', async () => {
    // Иначе каждое пробуждение выбрасывало бы всех, кто вошёл в прототип.
    const first = await ensureSecrets(pool, 'sandbox-brisk-sail')
    const second = await ensureSecrets(pool, 'sandbox-brisk-sail')

    expect(second).toEqual(first)
  })

  it('у разных сэндбоксов разные секреты', async () => {
    await pool.query(
      `insert into sandboxes (name, status, github_login, repo_full_name, repo_url, provisioned_at)
       values ('sandbox-misty-raven', 'created', 'gutnikov', 'gutnikov/y', 'https://github.com/y', now())`,
    )

    const one = await ensureSecrets(pool, 'sandbox-brisk-sail')
    const two = await ensureSecrets(pool, 'sandbox-misty-raven')

    expect(one.sessionSecret).not.toBe(two.sessionSecret)
    expect(one.password).not.toBe(two.password)
    expect(one.database).not.toBe(two.database)
  })

  it('чтение без создания ничего не выдумывает', async () => {
    expect(await readSecrets(pool, 'sandbox-brisk-sail')).toBeUndefined()

    await ensureSecrets(pool, 'sandbox-brisk-sail')
    expect(await readSecrets(pool, 'sandbox-brisk-sail')).toBeDefined()
  })

  it('окружение содержит ровно то, что нужно приложению', async () => {
    const secrets = await ensureSecrets(pool, 'sandbox-brisk-sail')

    const env = environmentFor(ADMIN, secrets, 'https://sandbox-brisk-sail.zerotomvp.xyz')

    expect(Object.keys(env).sort()).toEqual([
      'BETTER_AUTH_SECRET',
      'DATABASE_URL',
      'SHIP_PUBLIC_URL',
    ])
    expect(env.DATABASE_URL).toContain('sb_brisk_sail')
    // Административные реквизиты в сэндбокс не уезжают.
    expect(env.DATABASE_URL).not.toContain('sandboxadmin')
  })
})
