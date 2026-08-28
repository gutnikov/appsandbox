import type { Pool } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { migrate } from '../db/migrate.ts'
import { createPool } from '../db/pool.ts'
import {
  MAX_RESERVE_ATTEMPTS,
  NameExhaustedError,
  findByRepoFullName,
  markProvisioned,
  releaseName,
  reserveName,
} from './registry.ts'

const DATABASE_URL = process.env.DATABASE_URL

describe.runIf(DATABASE_URL)('реестр имён сэндбоксов', () => {
  let pool: Pool

  beforeAll(async () => {
    pool = createPool(DATABASE_URL as string)
    await migrate(pool)
  })

  afterAll(async () => {
    await pool.end()
  })

  beforeEach(async () => {
    await pool.query('truncate sandboxes')
  })

  it('резервирует имя за пользователем', async () => {
    const name = await reserveName(pool, 'gutnikov')

    const { rows } = await pool.query('select * from sandboxes where name = $1', [name])
    expect(rows[0]).toMatchObject({ name, github_login: 'gutnikov', status: 'reserved' })
  })

  it('при занятом имени берёт следующее', async () => {
    const taken = await reserveName(pool, 'first', { nextName: () => 'sandbox-brave-otter' })
    expect(taken).toBe('sandbox-brave-otter')

    const next = await reserveName(pool, 'second', {
      nextName: (attempt) => (attempt === 1 ? 'sandbox-brave-otter' : 'sandbox-calm-heron'),
    })
    expect(next).toBe('sandbox-calm-heron')
  })

  it('сдаётся после ограниченного числа попыток', async () => {
    await reserveName(pool, 'first', { nextName: () => 'sandbox-brave-otter' })

    await expect(
      reserveName(pool, 'second', { nextName: () => 'sandbox-brave-otter' }),
    ).rejects.toBeInstanceOf(NameExhaustedError)
  })

  it('гонку двух одновременных запросов разрешает база, а не проверка в коде', async () => {
    const nextName = (attempt: number) =>
      attempt === 1 ? 'sandbox-brave-otter' : `sandbox-calm-heron-${attempt}`

    const [first, second] = await Promise.all([
      reserveName(pool, 'one', { nextName }),
      reserveName(pool, 'two', { nextName }),
    ])

    expect(first).not.toBe(second)
    expect([first, second]).toContain('sandbox-brave-otter')

    const { rows } = await pool.query('select count(*)::int as n from sandboxes')
    expect(rows[0]?.n).toBe(2)
  })

  it('отказывается резервировать имя, не проходящее формат', async () => {
    await expect(reserveName(pool, 'gutnikov', { nextName: () => 'www' })).rejects.toThrow(
      /некорректное имя/i,
    )
  })

  it('освобождает имя, если репозиторий создать не удалось', async () => {
    const name = await reserveName(pool, 'gutnikov')

    expect(await releaseName(pool, name)).toBe(true)

    const { rows } = await pool.query('select count(*)::int as n from sandboxes where name = $1', [
      name,
    ])
    expect(rows[0]?.n).toBe(0)

    // Освобождённое имя снова доступно.
    const again = await reserveName(pool, 'someone-else', { nextName: () => name })
    expect(again).toBe(name)
  })

  it('не освобождает имя созданного сэндбокса', async () => {
    const name = await reserveName(pool, 'gutnikov')
    await markProvisioned(pool, name, {
      fullName: `gutnikov/${name}`,
      url: `https://github.com/gutnikov/${name}`,
    })

    expect(await releaseName(pool, name)).toBe(false)
  })

  it('связывает имя с созданным репозиторием и не хранит токенов', async () => {
    const name = await reserveName(pool, 'gutnikov')
    const row = await markProvisioned(pool, name, {
      fullName: `gutnikov/${name}`,
      url: `https://github.com/gutnikov/${name}`,
    })

    expect(row).toMatchObject({
      name,
      status: 'created',
      github_login: 'gutnikov',
      repo_full_name: `gutnikov/${name}`,
      repo_url: `https://github.com/gutnikov/${name}`,
    })
    expect(row.provisioned_at).toBeInstanceOf(Date)

    const { fields } = await pool.query('select * from sandboxes limit 1')
    const columns = fields.map((field) => field.name)
    expect(columns.some((column) => /token|secret|password/i.test(column))).toBe(false)
  })

  it('находит сэндбокс по репозиторию — для сверки OIDC-удостоверений', async () => {
    const name = await reserveName(pool, 'gutnikov')
    await markProvisioned(pool, name, {
      fullName: `gutnikov/${name}`,
      url: `https://github.com/gutnikov/${name}`,
    })

    expect(await findByRepoFullName(pool, `gutnikov/${name}`)).toMatchObject({ name })
    expect(await findByRepoFullName(pool, 'someone/else')).toBeUndefined()
  })

  it('зарезервированный, но не созданный сэндбокс по репозиторию не находится', async () => {
    const name = await reserveName(pool, 'gutnikov')
    expect(await findByRepoFullName(pool, `gutnikov/${name}`)).toBeUndefined()
  })

  it('число попыток по умолчанию ограничено', () => {
    expect(MAX_RESERVE_ATTEMPTS).toBeGreaterThan(1)
    expect(MAX_RESERVE_ATTEMPTS).toBeLessThan(50)
  })
})
