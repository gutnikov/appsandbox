import { Hono } from 'hono'
import { safeEqual } from '../auth/signing.ts'
import type { Env } from '../env.ts'

/** Событие публикации, как его присылает реестр. */
type RegistryEvent = {
  action?: string
  target?: {
    mediaType?: string
    digest?: string
    repository?: string
    tag?: string
  }
}

/** Слои и конфигурации нас не интересуют — только манифест образа. */
function isManifestPush(event: RegistryEvent): boolean {
  return (
    event.action === 'push' &&
    typeof event.target?.digest === 'string' &&
    typeof event.target.repository === 'string' &&
    /manifest/i.test(event.target.mediaType ?? '')
  )
}

export type RegistryEventsDeps = {
  env: Env
  /** Записывает, из какого образа теперь следует запускать сэндбокс. */
  onImagePushed: (name: string, digest: string) => Promise<boolean>
  log?: (message: string) => void
}

export function createRegistryEventRoutes(deps: RegistryEventsDeps) {
  const routes = new Hono()
  const log = deps.log ?? ((message: string) => console.log(message))

  routes.post('/events', async (c) => {
    const header = c.req.header('authorization') ?? ''
    const presented = header.toLowerCase().startsWith('bearer ') ? header.slice(7) : ''

    // Уведомление меняет то, какой образ будет запущен, поэтому источник
    // обязан быть подтверждён.
    if (!presented || !safeEqual(presented, deps.env.REGISTRY_EVENTS_SECRET)) {
      return c.json({ error: 'unauthorized' }, 401)
    }

    const body = (await c.req.json().catch(() => null)) as { events?: RegistryEvent[] } | null
    const events = (body?.events ?? []).filter(isManifestPush)

    let applied = 0
    for (const event of events) {
      const name = event.target?.repository as string
      const digest = event.target?.digest as string
      if (await deps.onImagePushed(name, digest)) {
        applied += 1
        log(`новая версия образа: ${name} ${digest.slice(0, 19)}`)
      }
    }

    return c.json({ applied })
  })

  return routes
}
