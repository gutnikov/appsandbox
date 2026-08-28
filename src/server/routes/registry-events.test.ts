import { describe, expect, it } from 'vitest'
import { createApp } from '../app.ts'
import { testEnv } from '../testing/env.ts'
import { createRegistryEventRoutes } from './registry-events.ts'

const SECRET = testEnv().REGISTRY_EVENTS_SECRET
const DIGEST = 'sha256:8d1f4a1b0f6d4a2f8b6c1d3e5f70819a2b3c4d5e6f708192a3b4c5d6e7f80912'

function harness() {
  const applied: { name: string; digest: string }[] = []
  const env = testEnv()

  const app = createApp({
    env,
    healthChecks: [],
    provision: async () => ({ name: 'x', repoUrl: 'x', repoFullName: 'x' }),
    registryEvents: createRegistryEventRoutes({
      env,
      onImagePushed: async (name, digest) => {
        applied.push({ name, digest })
        return true
      },
      log: () => {},
    }),
  })

  return { app, applied }
}

function post(app: ReturnType<typeof createApp>, body: unknown, secret = SECRET) {
  return app.request('/api/registry/events', {
    method: 'POST',
    headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const manifestPush = (repository: string, tag: string) => ({
  action: 'push',
  target: {
    mediaType: 'application/vnd.oci.image.manifest.v1+json',
    digest: DIGEST,
    repository,
    tag,
  },
})

describe('уведомления реестра о публикации', () => {
  it('запоминает новую версию образа', async () => {
    const h = harness()

    const response = await post(h.app, { events: [manifestPush('sandbox-brisk-sail', 'abc123')] })

    expect(response.status).toBe(200)
    expect(h.applied).toEqual([{ name: 'sandbox-brisk-sail', digest: DIGEST }])
  })

  it('без подтверждения источника ничего не делает', async () => {
    const h = harness()

    // Заголовки HTTP — только латиница, поэтому подделка тоже латиницей.
    const response = await post(h.app, { events: [manifestPush('sandbox-x', 'v1')] }, 'forged')

    expect(response.status).toBe(401)
    expect(h.applied).toEqual([])
  })

  it('совсем без заголовка тоже отказывает', async () => {
    const h = harness()

    const response = await h.app.request('/api/registry/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ events: [manifestPush('sandbox-x', 'v1')] }),
    })

    expect(response.status).toBe(401)
    expect(h.applied).toEqual([])
  })

  it('скачивания и слои пропускает', async () => {
    const h = harness()

    await post(h.app, {
      events: [
        { action: 'pull', target: { mediaType: 'application/vnd.oci.image.manifest.v1+json', digest: DIGEST, repository: 'sandbox-x' } },
        { action: 'push', target: { mediaType: 'application/octet-stream', digest: DIGEST, repository: 'sandbox-x' } },
      ],
    })

    expect(h.applied).toEqual([])
  })

  it('две публикации одного образа под разными тегами дают одну версию', async () => {
    const h = harness()

    await post(h.app, {
      events: [manifestPush('sandbox-x', 'abc123'), manifestPush('sandbox-x', 'latest')],
    })

    expect(h.applied.map((item) => item.digest)).toEqual([DIGEST, DIGEST])
  })

  it('мусор вместо тела не роняет обработчик', async () => {
    const h = harness()

    const response = await h.app.request('/api/registry/events', {
      method: 'POST',
      headers: { authorization: `Bearer ${SECRET}`, 'content-type': 'application/json' },
      body: 'не json',
    })

    expect(response.status).toBe(200)
    expect(h.applied).toEqual([])
  })
})
