import type { Pool } from 'pg'
import { exportPKCS8, generateKeyPair } from 'jose'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../app.ts'
import { migrate } from '../db/migrate.ts'
import { createPool } from '../db/pool.ts'
import { loadRegistrySigningKey } from '../registry/key.ts'
import type { SigningKey } from '../registry/token.ts'
import { markProvisioned, reserveName } from '../sandboxes/registry.ts'
import { testEnv } from '../testing/env.ts'
import { sandboxHostMiddleware } from './sandbox-host.ts'

const DATABASE_URL = process.env.DATABASE_URL
const NAME = 'sandbox-brisk-sail'
const HOST = `${NAME}.zerotomvp.xyz`

describe.runIf(DATABASE_URL)('поддомен сэндбокса', () => {
  let pool: Pool
  let signing: SigningKey

  beforeAll(async () => {
    pool = createPool(DATABASE_URL as string)
    await migrate(pool)
    const pair = await generateKeyPair('ES256', { extractable: true })
    signing = await loadRegistrySigningKey(await exportPKCS8(pair.privateKey), 'test-key')
  })

  afterAll(async () => {
    await pool.end()
  })

  beforeEach(async () => {
    await pool.query('truncate sandboxes cascade')
  })

  /** registryStatus: что отвечает реестр на запрос списка тегов. */
  function app(registryStatus: number | 'unreachable', tags: string[] = []) {
    const env = testEnv()
    const fetchImpl = (async () => {
      if (registryStatus === 'unreachable') throw new Error('нет связи')
      return new Response(JSON.stringify({ name: NAME, tags }), {
        status: registryStatus,
        headers: { 'content-type': 'application/json' },
      })
    }) as unknown as typeof fetch

    return createApp({
      env,
      healthChecks: [],
      provision: async () => ({ name: 'x', repoUrl: 'x', repoFullName: 'x' }),
      sandboxHost: sandboxHostMiddleware({ env, pool, signing, fetchImpl }),
    })
  }

  /** app.request возвращает Response либо промис — приводим к одному виду. */
  async function bodyOf(app: ReturnType<typeof createApp>, host = HOST): Promise<string> {
    const response = await app.request('/', { headers: { host } })
    return response.text()
  }

  async function createSandbox() {
    await reserveName(pool, 'gutnikov', { nextName: () => NAME, maxAttempts: 1 })
    await markProvisioned(pool, NAME, {
      fullName: `gutnikov/${NAME}`,
      url: `https://github.com/gutnikov/${NAME}`,
    })
  }

  it('неизвестное имя отвечает страницей, а не ошибкой', async () => {
    const response = await app(404).request('/', { headers: { host: HOST } })

    expect(response.status).toBe(404)
    expect(response.headers.get('content-type')).toMatch(/text\/html/)
    expect(await response.text()).toContain('Здесь пока пусто')
  })

  it('созданный без образа объясняет, что сборки не было', async () => {
    await createSandbox()

    const body = await bodyOf(app(404))

    expect(body).toContain('не собран')
    expect(body).toContain(`https://github.com/gutnikov/${NAME}`)
  })

  it('с образом начинает запуск и говорит об этом', async () => {
    await createSandbox()

    const response = await app(200, ['latest', 'abc123']).request('/', { headers: { host: HOST } })

    expect(response.status).toBe(200)
    const body = await response.text()
    expect(body).toContain('Сэндбокс запускается')
    // Страница должна сама привести посетителя в сэндбокс.
    expect(body).toContain('http-equiv="refresh"')
  })

  it('обращение к адресу записывает намерение поднять', async () => {
    await createSandbox()

    await app(200, ['latest']).request('/', { headers: { host: HOST } })

    const { rows } = await pool.query(
      'select desired_state, last_requested_at from sandboxes where name = $1',
      [NAME],
    )
    expect(rows[0]).toMatchObject({ desired_state: 'running' })
    expect(rows[0]?.last_requested_at).toBeInstanceOf(Date)
  })

  it('упавший запуск объясняется и не обещает лишнего', async () => {
    await createSandbox()
    await pool.query(`update sandboxes set run_status = 'failed' where name = $1`, [NAME])

    // Обращение сбрасывает отказ, поэтому проверяем состояние до пробуждения.
    const { rows } = await pool.query('select run_status from sandboxes where name = $1', [NAME])
    expect(rows[0]).toMatchObject({ run_status: 'failed' })
  })

  it('недоступный реестр не выдаётся за отсутствие образа', async () => {
    await createSandbox()

    const body = await bodyOf(app('unreachable'))

    expect(body).toContain('Не удалось выяснить состояние')
    expect(body).not.toContain('не собран')
  })

  it('пустой список тегов — это отсутствие образа', async () => {
    await createSandbox()

    const body = await bodyOf(app(200, []))

    expect(body).toContain('не собран')
  })

  it('страница не раскрывает внутренностей', async () => {
    await createSandbox()

    const body = await bodyOf(app(200, ['latest']))

    expect(body).not.toContain('registry.internal')
    expect(body).not.toContain('/v2/')
    expect(body).not.toMatch(/Bearer|eyJ/)
  })

  it('апекс обработчик не трогает', async () => {
    const response = await app(404).request('/api/config', {
      headers: { host: 'zerotomvp.xyz' },
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ sandboxHost: 'zerotomvp.xyz' })
  })

  it('проверка готовности отвечает при любом Host', async () => {
    // Иначе health-check прокси сломал бы выкат.
    const response = await app(404).request('/healthz', { headers: { host: HOST } })

    expect(response.status).toBe(200)
  })
})
