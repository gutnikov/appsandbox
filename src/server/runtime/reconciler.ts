import type { Pool } from 'pg'
import type { Env } from '../env.ts'
import {
  type SandboxLimits,
  containerName,
  listSandboxContainers,
  pull,
  removeContainer,
  routeSandbox,
  routedSandboxes,
  startSandbox,
  unrouteSandbox,
} from './docker.ts'
import type { RunStatus } from './state.ts'

export type ReconcilerConfig = {
  env: Env
  pool: Pool
  limits: SandboxLimits
  /** Сколько сэндбоксов держим запущенными одновременно. */
  maxRunning: number
  /** Сколько живёт сэндбокс с момента запуска. */
  lifetimeMs: number
  log?: (message: string) => void
}

type Row = {
  name: string
  desired_state: 'stopped' | 'running'
  desired_image_digest: string | null
  running_image_digest: string | null
  run_status: RunStatus
  started_at: Date | null
  last_requested_at: Date | null
}

async function load(pool: Pool): Promise<Row[]> {
  const { rows } = await pool.query<Row>(
    `select name, desired_state, desired_image_digest, running_image_digest,
            run_status, started_at, last_requested_at
       from sandboxes
      where status = 'created'
      order by last_requested_at asc nulls first`,
  )
  return rows
}

async function setRun(
  pool: Pool,
  name: string,
  patch: { status: RunStatus; digest?: string | null; error?: string | null; started?: boolean },
): Promise<void> {
  await pool.query(
    `update sandboxes
        set run_status = $2,
            running_image_digest = coalesce($3, running_image_digest),
            run_error = $4,
            started_at = case when $5 then now() else started_at end
      where name = $1`,
    [name, patch.status, patch.digest ?? null, patch.error ?? null, patch.started ?? false],
  )
}

async function setDesired(pool: Pool, name: string, desired: 'stopped' | 'running'): Promise<void> {
  await pool.query('update sandboxes set desired_state = $2 where name = $1', [name, desired])
}

/**
 * Произвольное, но постоянное число. Под этим ключом процессы сведения
 * сериализуются: во время выката новый процесс поднимается до удаления
 * старого, и без блокировки они могли бы тянуть контейнеры в разные стороны.
 */
const ADVISORY_LOCK_KEY = 7_314_902_551

export class Reconciler {
  private readonly config: ReconcilerConfig
  private readonly log: (message: string) => void
  private readonly apexHost: string

  constructor(config: ReconcilerConfig) {
    this.config = config
    this.log = config.log ?? ((message) => console.log(message))
    this.apexHost = new URL(config.env.PUBLIC_BASE_URL).host
  }

  /**
   * Один проход сведения. Идемпотентен: повторный вызов ничего не ломает.
   * Возвращает false, если проход пропущен из-за другого работающего процесса.
   */
  async tick(): Promise<boolean> {
    const client = await this.config.pool.connect()
    try {
      const { rows } = await client.query<{ locked: boolean }>(
        'select pg_try_advisory_lock($1) as locked',
        [ADVISORY_LOCK_KEY],
      )
      if (!rows[0]?.locked) return false

      try {
        await this.reconcile()
      } finally {
        await client.query('select pg_advisory_unlock($1)', [ADVISORY_LOCK_KEY])
      }
    } finally {
      client.release()
    }

    return true
  }

  private async reconcile(): Promise<void> {
    const rows = await load(this.config.pool)
    const containers = await listSandboxContainers()
    const routed = await routedSandboxes()
    const byName = new Map(rows.map((row) => [row.name, row]))

    await this.dropOrphans(containers, byName, routed)
    await this.expireIdle(rows)
    await this.enforceLimit(rows)

    // Перечитываем: намерения могли измениться в предыдущих шагах.
    for (const row of await load(this.config.pool)) {
      const container = containers.find((item) => item.sandbox === row.name)

      if (row.desired_state === 'stopped') {
        if (container || routed.has(row.name)) await this.stop(row.name)
        else if (row.run_status !== 'stopped') {
          await setRun(this.config.pool, row.name, { status: 'stopped' })
        }
        continue
      }

      const alive = container?.running === true && routed.has(row.name)
      const versionMatches =
        !row.desired_image_digest || row.running_image_digest === row.desired_image_digest

      if (alive && versionMatches) {
        if (row.run_status !== 'running') {
          await setRun(this.config.pool, row.name, { status: 'running' })
        }
        continue
      }

      if (row.run_status === 'failed') continue

      await this.start(row)
    }
  }

  /** Контейнеры и маршруты, за которыми не стоит ни один сэндбокс. */
  private async dropOrphans(
    containers: { sandbox: string }[],
    byName: Map<string, Row>,
    routed: Set<string>,
  ): Promise<void> {
    for (const container of containers) {
      if (byName.has(container.sandbox)) continue
      this.log(`убираю осиротевший контейнер ${container.sandbox}`)
      await removeContainer(container.sandbox)
    }

    for (const name of routed) {
      if (byName.has(name)) continue
      this.log(`убираю осиротевший маршрут ${name}`)
      await unrouteSandbox(name)
    }
  }

  private async expireIdle(rows: Row[]): Promise<void> {
    const deadline = Date.now() - this.config.lifetimeMs

    for (const row of rows) {
      if (row.desired_state !== 'running' || !row.started_at) continue
      if (row.started_at.getTime() > deadline) continue

      this.log(`останавливаю по времени жизни: ${row.name}`)
      await setDesired(this.config.pool, row.name, 'stopped')
    }
  }

  /**
   * Вытесняем по давности обращения. На маленьком сервере это обычный режим
   * работы, а не авария: вытесненный сэндбокс поднимется при следующем заходе.
   */
  private async enforceLimit(rows: Row[]): Promise<void> {
    const wanted = rows.filter((row) => row.desired_state === 'running')
    if (wanted.length <= this.config.maxRunning) return

    // Строки уже отсортированы по давности обращения.
    for (const row of wanted.slice(0, wanted.length - this.config.maxRunning)) {
      this.log(`вытесняю ради места: ${row.name}`)
      await setDesired(this.config.pool, row.name, 'stopped')
    }
  }

  private async stop(name: string): Promise<void> {
    this.log(`останавливаю ${name}`)
    await unrouteSandbox(name)
    await removeContainer(name)
    await setRun(this.config.pool, name, { status: 'stopped' })
  }

  private async start(row: Row): Promise<void> {
    const digest = row.desired_image_digest
    const reference = digest
      ? `${this.config.env.REGISTRY_HOST}/${row.name}@${digest}`
      : `${this.config.env.REGISTRY_HOST}/${row.name}:latest`

    this.log(`поднимаю ${row.name} из ${reference}`)
    await setRun(this.config.pool, row.name, { status: 'starting' })

    try {
      await pull(reference)
      await startSandbox(row.name, reference, this.config.limits)
      await routeSandbox(row.name, `${row.name}.${this.apexHost}`)
    } catch (error) {
      const reason = error instanceof Error ? error.message.slice(0, 300) : 'неизвестная ошибка'
      this.log(`не удалось поднять ${row.name}: ${reason}`)

      // Маршрут и контейнер не оставляем: адрес должен вернуться к странице
      // состояния, а не отдавать 502 из мёртвого контейнера.
      await unrouteSandbox(row.name)
      await removeContainer(row.name)
      await setRun(this.config.pool, row.name, { status: 'failed', error: reason })
      return
    }

    await setRun(this.config.pool, row.name, {
      status: 'running',
      digest: digest ?? null,
      started: true,
    })
    this.log(`${row.name} поднят как ${containerName(row.name)}`)
  }
}
