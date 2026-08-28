import type { Pool } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { migrate } from '../db/migrate.ts'
import { createPool } from '../db/pool.ts'
import { testEnv } from '../testing/env.ts'

/** Docker подменяем целиком: проверяем решения, а не работу с контейнерами. */
const docker = vi.hoisted(() => ({
  containers: [] as { sandbox: string; container: string; image: string; running: boolean }[],
  routed: new Set<string>(),
  failStart: false,
  calls: [] as string[],
}))

vi.mock('./docker.ts', () => ({
  SANDBOX_LABEL: 'zerotomvp.sandbox',
  containerName: (name: string) => `zerotomvp-sandbox-${name}`,
  listSandboxContainers: async () => docker.containers,
  routedSandboxes: async () => new Set(docker.routed),
  pull: async () => {},
  startSandbox: async (name: string) => {
    docker.calls.push(`start:${name}`)
    if (docker.failStart) throw new Error('образ не запускается')
    docker.containers.push({
      sandbox: name,
      container: `zerotomvp-sandbox-${name}`,
      image: 'x',
      running: true,
    })
  },
  routeSandbox: async (name: string) => {
    docker.calls.push(`route:${name}`)
    docker.routed.add(name)
  },
  unrouteSandbox: async (name: string) => {
    docker.calls.push(`unroute:${name}`)
    docker.routed.delete(name)
  },
  removeContainer: async (name: string) => {
    docker.calls.push(`remove:${name}`)
    docker.containers = docker.containers.filter((item) => item.sandbox !== name)
  },
  login: async () => {},
}))

const { Reconciler } = await import('./reconciler.ts')

const DATABASE_URL = process.env.DATABASE_URL

describe.runIf(DATABASE_URL)('сведение состояний', () => {
  let pool: Pool

  const make = (over: Partial<{ maxRunning: number; lifetimeMs: number }> = {}) =>
    new Reconciler({
      env: testEnv(),
      pool,
      limits: { memoryMb: 128, cpus: 0.5, network: 'test-net' },
      maxRunning: over.maxRunning ?? 3,
      lifetimeMs: over.lifetimeMs ?? 30 * 60 * 1000,
      log: () => {},
    })

  async function seed(name: string, patch: Record<string, unknown> = {}) {
    await pool.query(
      `insert into sandboxes (name, status, github_login, repo_full_name, repo_url, provisioned_at)
       values ($1, 'created', 'gutnikov', 'gutnikov/' || $1, 'https://github.com/x', now())`,
      [name],
    )
    for (const [column, value] of Object.entries(patch)) {
      await pool.query(`update sandboxes set ${column} = $2 where name = $1`, [name, value])
    }
  }

  const read = async (name: string) => {
    const { rows } = await pool.query(
      'select desired_state, run_status, run_error, started_at from sandboxes where name = $1',
      [name],
    )
    return rows[0] as {
      desired_state: string
      run_status: string
      run_error: string | null
      started_at: Date | null
    }
  }

  beforeAll(async () => {
    pool = createPool(DATABASE_URL as string)
    await migrate(pool)
  })

  afterAll(async () => {
    await pool.end()
  })

  beforeEach(async () => {
    await pool.query('truncate sandboxes')
    docker.containers = []
    docker.routed = new Set()
    docker.failStart = false
    docker.calls = []
  })

  it('поднимает сэндбокс, которого хотят', async () => {
    await seed('sandbox-one', { desired_state: 'running', last_requested_at: new Date() })

    await make().tick()

    expect(docker.calls).toContain('start:sandbox-one')
    expect(docker.calls).toContain('route:sandbox-one')
    const row = await read('sandbox-one')
    expect(row.run_status).toBe('running')
    expect(row.started_at).toBeInstanceOf(Date)
  })

  it('повторный проход ничего не делает заново', async () => {
    await seed('sandbox-one', { desired_state: 'running', last_requested_at: new Date() })
    await make().tick()
    docker.calls = []

    await make().tick()

    expect(docker.calls).toEqual([])
  })

  it('останавливает и снимает маршрут, когда сэндбокс больше не нужен', async () => {
    await seed('sandbox-one', { desired_state: 'running', last_requested_at: new Date() })
    await make().tick()
    await pool.query(`update sandboxes set desired_state = 'stopped'`)
    docker.calls = []

    await make().tick()

    expect(docker.calls).toContain('unroute:sandbox-one')
    expect(docker.calls).toContain('remove:sandbox-one')
    expect((await read('sandbox-one')).run_status).toBe('stopped')
  })

  it('вытесняет по давности обращения, когда мест не хватает', async () => {
    const old = new Date(Date.now() - 60_000)
    await seed('sandbox-old', { desired_state: 'running', last_requested_at: old })
    await seed('sandbox-new', { desired_state: 'running', last_requested_at: new Date() })

    await make({ maxRunning: 1 }).tick()

    expect((await read('sandbox-old')).desired_state).toBe('stopped')
    expect((await read('sandbox-new')).desired_state).toBe('running')
    expect(docker.calls).toContain('start:sandbox-new')
    expect(docker.calls).not.toContain('start:sandbox-old')
  })

  it('останавливает по истечении времени жизни', async () => {
    await seed('sandbox-one', { desired_state: 'running', last_requested_at: new Date() })
    await make().tick()
    await pool.query(`update sandboxes set started_at = now() - interval '2 hours'`)

    await make({ lifetimeMs: 60_000 }).tick()

    expect((await read('sandbox-one')).desired_state).toBe('stopped')
    expect(docker.routed.has('sandbox-one')).toBe(false)
  })

  it('убирает контейнер и маршрут, за которыми не стоит сэндбокс', async () => {
    docker.containers.push({
      sandbox: 'sandbox-ghost',
      container: 'zerotomvp-sandbox-sandbox-ghost',
      image: 'x',
      running: true,
    })
    docker.routed.add('sandbox-ghost')

    await make().tick()

    expect(docker.calls).toContain('remove:sandbox-ghost')
    expect(docker.calls).toContain('unroute:sandbox-ghost')
  })

  it('неудачный запуск не оставляет мусора и объясняется', async () => {
    await seed('sandbox-bad', { desired_state: 'running', last_requested_at: new Date() })
    docker.failStart = true

    await make().tick()

    const row = await read('sandbox-bad')
    expect(row.run_status).toBe('failed')
    expect(row.run_error).toContain('не запускается')
    // Адрес должен вернуться к странице состояния, а не отдавать 502.
    expect(docker.routed.has('sandbox-bad')).toBe(false)
  })

  it('не пытается поднимать упавший снова и снова', async () => {
    await seed('sandbox-bad', { desired_state: 'running', last_requested_at: new Date() })
    docker.failStart = true
    await make().tick()
    docker.calls = []

    await make().tick()

    expect(docker.calls).not.toContain('start:sandbox-bad')
  })

  it('восстанавливает исчезнувший контейнер', async () => {
    await seed('sandbox-one', { desired_state: 'running', last_requested_at: new Date() })
    await make().tick()

    // Контейнер пропал, а сэндбокс по-прежнему считается запущенным.
    docker.containers = []
    docker.calls = []

    await make().tick()

    expect(docker.calls).toContain('start:sandbox-one')
    expect((await read('sandbox-one')).run_status).toBe('running')
  })
})
