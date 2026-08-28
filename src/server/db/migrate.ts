import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Pool } from 'pg'

const MIGRATIONS_DIR = 'migrations'

// Произвольное, но постоянное число: под этим ключом раннеры сериализуются,
// чтобы два одновременных выката не накатывали одну миграцию дважды.
const ADVISORY_LOCK_KEY = 4_073_218_915

export type MigrationResult = {
  applied: string[]
  skipped: string[]
}

function listMigrations(dir: string): string[] {
  return readdirSync(dir)
    .filter((file) => file.endsWith('.sql'))
    .sort()
}

export async function migrate(pool: Pool, dir = MIGRATIONS_DIR): Promise<MigrationResult> {
  const client = await pool.connect()
  const result: MigrationResult = { applied: [], skipped: [] }

  try {
    await client.query(`
      create table if not exists schema_migrations (
        version    text primary key,
        applied_at timestamptz not null default now()
      )
    `)
    await client.query('select pg_advisory_lock($1)', [ADVISORY_LOCK_KEY])

    const { rows } = await client.query<{ version: string }>('select version from schema_migrations')
    const done = new Set(rows.map((row) => row.version))

    for (const version of listMigrations(dir)) {
      if (done.has(version)) {
        result.skipped.push(version)
        continue
      }

      const sql = readFileSync(join(dir, version), 'utf8')

      // Каждая миграция — одна транзакция: либо она применилась целиком
      // и отметилась в журнале, либо не применилась вовсе.
      await client.query('begin')
      try {
        await client.query(sql)
        await client.query('insert into schema_migrations (version) values ($1)', [version])
        await client.query('commit')
      } catch (error) {
        await client.query('rollback')
        throw new Error(`Миграция ${version} не применилась: ${(error as Error).message}`, {
          cause: error,
        })
      }

      result.applied.push(version)
    }

    return result
  } finally {
    await client.query('select pg_advisory_unlock($1)', [ADVISORY_LOCK_KEY]).catch(() => {})
    client.release()
  }
}
