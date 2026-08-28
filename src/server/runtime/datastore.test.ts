import { Client } from 'pg'
import { afterAll, describe, expect, it } from 'vitest'
import {
  connectionStringFor,
  databaseNameFor,
  dropDatastore,
  ensureDatastore,
  generatePassword,
} from './datastore.ts'

const ADMIN_URL = process.env.DATABASE_URL

const one = { database: 'sb_test_one', user: 'sb_test_one', password: generatePassword() }
const two = { database: 'sb_test_two', user: 'sb_test_two', password: generatePassword() }

async function query(url: string, sql: string): Promise<unknown[]> {
  const client = new Client({ connectionString: url })
  await client.connect()
  try {
    const { rows } = await client.query(sql)
    return rows
  } finally {
    await client.end()
  }
}

describe('имя базы из имени сэндбокса', () => {
  it('отбрасывает префикс и заменяет дефисы', () => {
    expect(databaseNameFor('sandbox-brisk-sail')).toBe('sb_brisk_sail')
  })

  it('разные сэндбоксы дают разные базы', () => {
    expect(databaseNameFor('sandbox-a-b')).not.toBe(databaseNameFor('sandbox-ab'))
  })
})

describe('строка подключения', () => {
  it('берёт хост у административной, а остальное — у сэндбокса', () => {
    const url = connectionStringFor('postgres://admin:pw@db-host:5432/admin', one)

    expect(url).toContain('@db-host:5432/sb_test_one')
    expect(url).toContain('sb_test_one:')
    expect(url).not.toContain('admin:pw')
  })
})

describe.runIf(ADMIN_URL)('выдача базы сэндбоксу', () => {
  afterAll(async () => {
    for (const credentials of [one, two]) {
      await dropDatastore(ADMIN_URL as string, credentials).catch(() => {})
    }
  })

  it('создаёт базу и пользователя, который в неё попадает', async () => {
    await ensureDatastore(ADMIN_URL as string, one)

    const rows = await query(connectionStringFor(ADMIN_URL as string, one), 'select current_database() as db')
    expect(rows[0]).toMatchObject({ db: 'sb_test_one' })
  })

  it('повторный вызов безвреден', async () => {
    await ensureDatastore(ADMIN_URL as string, one)
    await ensureDatastore(ADMIN_URL as string, one)

    const rows = await query(connectionStringFor(ADMIN_URL as string, one), 'select 1 as ok')
    expect(rows[0]).toMatchObject({ ok: 1 })
  })

  it('владелец может создавать таблицы в своей базе', async () => {
    await ensureDatastore(ADMIN_URL as string, one)
    const url = connectionStringFor(ADMIN_URL as string, one)

    await query(url, 'create table if not exists thing (id int)')
    await query(url, 'insert into thing values (1)')

    expect(await query(url, 'select count(*)::int as n from thing')).toMatchObject([{ n: 1 }])
  })

  it('в чужую базу не пускает', async () => {
    await ensureDatastore(ADMIN_URL as string, one)
    await ensureDatastore(ADMIN_URL as string, two)

    // Подключаемся реквизитами одного сэндбокса к базе другого.
    const foreign = connectionStringFor(ADMIN_URL as string, {
      ...one,
      database: two.database,
    })

    await expect(query(foreign, 'select 1')).rejects.toThrow()
  })

  it('удаление убирает и базу, и пользователя', async () => {
    await ensureDatastore(ADMIN_URL as string, two)
    await dropDatastore(ADMIN_URL as string, two)

    const databases = await query(
      ADMIN_URL as string,
      `select 1 from pg_database where datname = '${two.database}'`,
    )
    const roles = await query(
      ADMIN_URL as string,
      `select 1 from pg_roles where rolname = '${two.user}'`,
    )

    expect(databases).toEqual([])
    expect(roles).toEqual([])
  })
})
