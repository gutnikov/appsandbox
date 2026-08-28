import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { createApp } from './app.ts'
import { testEnv } from './testing/env.ts'

const provision = async () => ({ name: 'x', repoUrl: 'x', repoFullName: 'x' })

describe('/api/config', () => {
  it('сообщает апекс, на поддоменах которого живут сэндбоксы', async () => {
    const app = createApp({ env: testEnv(), healthChecks: [], provision })

    const response = await app.request('/api/config')

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ sandboxHost: 'zerotomvp.xyz' })
  })
})

describe('отдача собранного клиента', () => {
  const dir = mkdtempSync(join(tmpdir(), 'zerotomvp-client-'))
  mkdirSync(join(dir, 'assets'), { recursive: true })
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>zerotomvp</title>')
  writeFileSync(join(dir, 'assets', 'index-abc123.js'), 'export const ok = 1')

  const app = createApp({
    env: testEnv({ NODE_ENV: 'production' }),
    healthChecks: [],
    provision,
    // serveStatic ожидает путь относительно рабочего каталога процесса.
    clientDir: `./${relative(process.cwd(), dir)}`,
  })

  afterAll(() => {
    // Временный каталог оставляем системе: тесты не должны чистить /tmp.
  })

  it('клиентский маршрут отдаёт бандл, а не 404', async () => {
    const response = await app.request('/created?name=sandbox-brave-otter')

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toMatch(/text\/html/)
  })

  it('существующий ассет отдаётся как есть', async () => {
    const response = await app.request('/assets/index-abc123.js')

    expect(response.status).toBe(200)
    expect(await response.text()).toContain('export const ok')
  })

  it('исчезнувший ассет отвечает 404, а не разметкой', async () => {
    // Так бывает у клиента со старой закешированной страницей сразу после
    // выката. HTML со статусом 200 сломал бы его молча.
    const response = await app.request('/assets/index-STALE.js')

    expect(response.status).toBe(404)
    expect(response.headers.get('content-type') ?? '').not.toMatch(/text\/html/)
  })

  it('неизвестный путь под /api остаётся ошибкой API', async () => {
    const response = await app.request('/api/nope')

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'not_found' })
  })
})
