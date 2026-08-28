import type { Pool } from 'pg'
import { randomBytes } from 'node:crypto'
import {
  type DatastoreCredentials,
  connectionStringFor,
  databaseNameFor,
  generatePassword,
} from './datastore.ts'

export type SandboxSecrets = DatastoreCredentials & {
  sessionSecret: string
}

type Row = {
  db_name: string | null
  db_user: string | null
  db_password: string | null
  session_secret: string | null
}

/**
 * Выдаёт реквизиты сэндбокса, создавая их при первом обращении.
 *
 * Один раз и навсегда: сэндбокс перезапускается постоянно, и меняющийся ключ
 * подписи выбрасывал бы всех, кто вошёл в прототип. Поэтому запись обновляется
 * только там, где значения ещё пусты.
 */
export async function ensureSecrets(pool: Pool, sandbox: string): Promise<SandboxSecrets> {
  const name = databaseNameFor(sandbox)

  const { rows } = await pool.query<Row>(
    `update sandboxes
        set db_name        = coalesce(db_name, $2),
            db_user        = coalesce(db_user, $2),
            db_password    = coalesce(db_password, $3),
            session_secret = coalesce(session_secret, $4)
      where name = $1 and status = 'created'
      returning db_name, db_user, db_password, session_secret`,
    [sandbox, name, generatePassword(), randomBytes(32).toString('base64url')],
  )

  const row = rows[0]
  if (!row?.db_name || !row.db_user || !row.db_password || !row.session_secret) {
    throw new Error(`Не удалось выдать реквизиты сэндбоксу ${sandbox}`)
  }

  return {
    database: row.db_name,
    user: row.db_user,
    password: row.db_password,
    sessionSecret: row.session_secret,
  }
}

/** Реквизиты уже созданного сэндбокса, если они есть. Ничего не создаёт. */
export async function readSecrets(pool: Pool, sandbox: string): Promise<SandboxSecrets | undefined> {
  const { rows } = await pool.query<Row>(
    'select db_name, db_user, db_password, session_secret from sandboxes where name = $1',
    [sandbox],
  )
  const row = rows[0]
  if (!row?.db_name || !row.db_user || !row.db_password || !row.session_secret) return undefined

  return {
    database: row.db_name,
    user: row.db_user,
    password: row.db_password,
    sessionSecret: row.session_secret,
  }
}

/** Окружение, которое получает контейнер сэндбокса. */
export function environmentFor(
  adminUrl: string,
  secrets: SandboxSecrets,
  publicUrl: string,
): Record<string, string> {
  return {
    DATABASE_URL: connectionStringFor(adminUrl, secrets),
    BETTER_AUTH_SECRET: secrets.sessionSecret,
    SHIP_PUBLIC_URL: publicUrl,
  }
}
