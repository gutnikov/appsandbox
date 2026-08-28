import { randomBytes } from 'node:crypto'
import { Client } from 'pg'

/**
 * Имя базы и пользователя выводится из имени сэндбокса: префикс отбрасывается,
 * дефисы становятся подчёркиваниями. Имена сэндбоксов подчёркиваний не
 * содержат, поэтому превращение обратимо и столкнуться два имени не могут.
 */
export function databaseNameFor(sandbox: string): string {
  return `sb_${sandbox.replace(/^sandbox-/, '').replace(/-/g, '_')}`
}

/** Идентификатор в кавычках. Имена мы строим сами, но кавычки дешевле веры. */
function quoteIdent(value: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(value)) {
    throw new Error(`Недопустимый идентификатор базы: ${value}`)
  }
  return `"${value}"`
}

function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

export function generatePassword(): string {
  return randomBytes(24).toString('base64url')
}

export type DatastoreCredentials = {
  database: string
  user: string
  password: string
}

/** Строка подключения сэндбокса строится из административной: хост тот же. */
export function connectionStringFor(adminUrl: string, credentials: DatastoreCredentials): string {
  const url = new URL(adminUrl)
  url.username = credentials.user
  url.password = credentials.password
  url.pathname = `/${credentials.database}`
  return url.toString()
}

async function withAdmin<T>(adminUrl: string, work: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: adminUrl })
  await client.connect()
  try {
    return await work(client)
  } finally {
    await client.end()
  }
}

/**
 * Заводит базу и пользователя, если их ещё нет. Повторный вызов безвреден:
 * процесс сведения может дойти сюда не с первого раза.
 *
 * Права даются только на свою базу, и отдельно отбирается право подключаться к
 * чужим: в Postgres по умолчанию подключиться к чужой базе может кто угодно.
 */
export async function ensureDatastore(
  adminUrl: string,
  credentials: DatastoreCredentials,
): Promise<void> {
  const database = quoteIdent(credentials.database)
  const user = quoteIdent(credentials.user)

  await withAdmin(adminUrl, async (client) => {
    const { rows: users } = await client.query('select 1 from pg_roles where rolname = $1', [
      credentials.user,
    ])
    if (users.length === 0) {
      await client.query(`create role ${user} login password ${quoteLiteral(credentials.password)}`)
    } else {
      // Пароль мог быть перевыпущен — приводим к тому, что хранит платформа.
      await client.query(`alter role ${user} password ${quoteLiteral(credentials.password)}`)
    }

    const { rows: databases } = await client.query('select 1 from pg_database where datname = $1', [
      credentials.database,
    ])
    if (databases.length === 0) {
      await client.query(`create database ${database} owner ${user}`)
    }

    // Право подключаться к базе есть у всех по умолчанию — отзываем у всех и
    // возвращаем только владельцу. Без этого сэндбокс дотянулся бы до соседа.
    await client.query(`revoke connect on database ${database} from public`)
    await client.query(`grant connect on database ${database} to ${user}`)
  })

  // Схему public в новой базе тоже нужно отдать владельцу: с Postgres 15 она
  // больше не доступна всем на запись.
  const ownerUrl = connectionStringFor(adminUrl, credentials)
  const asAdmin = new URL(ownerUrl)
  const adminParsed = new URL(adminUrl)
  asAdmin.username = adminParsed.username
  asAdmin.password = adminParsed.password

  await withAdmin(asAdmin.toString(), async (client) => {
    await client.query(`grant all on schema public to ${user}`)
    await client.query(`alter schema public owner to ${user}`)
  })
}

/**
 * Базы, похожие на выданные сэндбоксам. Отбор по нашему же префиксу: всё
 * остальное на этом сервере нас не касается.
 */
export async function listSandboxDatabases(adminUrl: string): Promise<string[]> {
  return withAdmin(adminUrl, async (client) => {
    const { rows } = await client.query<{ datname: string }>(
      "select datname from pg_database where datname like 'sb\\_%'",
    )
    return rows.map((row) => row.datname)
  })
}

/** Убирает базу и пользователя. Вызывается, когда сэндбокса больше нет. */
export async function dropDatastore(
  adminUrl: string,
  credentials: DatastoreCredentials,
): Promise<void> {
  const database = quoteIdent(credentials.database)
  const user = quoteIdent(credentials.user)

  await withAdmin(adminUrl, async (client) => {
    // Открытые соединения не дают удалить базу, а сэндбокс мог не успеть выйти.
    await client.query(`drop database if exists ${database} with (force)`)
    await client.query(`drop role if exists ${user}`)
  })
}
