import { createPool } from '../db/pool.ts'
import { EnvError, env } from '../env.ts'
import { attachToNetwork, login } from './docker.ts'
import { PLATFORM_PULL_USER } from '../routes/registry.ts'
import { Reconciler } from './reconciler.ts'
import { loadRegistrySigningKey } from '../registry/key.ts'
import { KEEP_IMAGES, pruneImages } from './images.ts'

/** Как часто сверяем желаемое с фактическим. */
const TICK_MS = 3_000

const SANDBOX_NETWORK = 'zerotomvp-sandboxes'
/** Чистка реестра идёт редко: она не срочная и лишний раз его дёргать незачем. */
const PRUNE_EVERY_TICKS = 60

async function main() {
  let config
  try {
    config = env()
  } catch (error) {
    if (error instanceof EnvError) {
      console.error(error.message)
      process.exit(1)
    }
    throw error
  }

  const pool = createPool(config.DATABASE_URL)

  // Kamal умеет задать контейнеру только одну сеть, а нам нужны обе: своя и
  // сеть сэндбоксов, где живёт их Postgres. Доступ к docker у нас уже есть,
  // поэтому подключаем себя сами — и переживаем этим любой выкат.
  const self = process.env['KAMAL_CONTAINER_NAME']
  if (self) {
    await attachToNetwork(self, SANDBOX_NETWORK)
    console.log(`подключился к сети ${SANDBOX_NETWORK}`)
  }

  // Печатаем до входа в реестр: если вход зависнет, пустой лог не объяснит,
  // на чём именно.
  console.log(`вхожу в реестр ${config.REGISTRY_HOST} как ${PLATFORM_PULL_USER}`)

  // Образы сэндбоксов лежат в закрытом реестре: внутренним службам платформы
  // выдаётся доступ только на чтение.
  await login(config.REGISTRY_HOST, PLATFORM_PULL_USER, config.REGISTRY_PULL_SECRET)

  const signing = await loadRegistrySigningKey(
    config.REGISTRY_TOKEN_KEY,
    config.REGISTRY_TOKEN_KID,
  )

  const limits = {
    memoryMb: config.SANDBOX_MEMORY_MB,
    cpus: config.SANDBOX_CPUS,
    network: SANDBOX_NETWORK,
  }
  const lifetimeMs = config.SANDBOX_LIFETIME_MINUTES * 60_000

  const reconciler = new Reconciler({
    env: config,
    pool,
    limits,
    maxRunning: config.SANDBOX_MAX_RUNNING,
    lifetimeMs,
  })

  console.log(
    `сведение состояний запущено: не больше ${config.SANDBOX_MAX_RUNNING} одновременно, ` +
      `${limits.memoryMb} МБ и ${limits.cpus} процессора на сэндбокс, ` +
      `время жизни ${config.SANDBOX_LIFETIME_MINUTES} мин`,
  )

  let stopping = false
  const stop = () => {
    stopping = true
  }
  process.on('SIGTERM', stop)
  process.on('SIGINT', stop)

  let ticks = 0
  while (!stopping) {
    try {
      await reconciler.tick()

      if (ticks % PRUNE_EVERY_TICKS === 0) {
        const pruned = await pruneImages({
          pool,
          signing,
          issuer: config.PUBLIC_BASE_URL,
          service: config.REGISTRY_HOST,
          baseUrl: config.REGISTRY_INTERNAL_URL,
        })
        if (pruned.deleted || pruned.failed) {
          console.log(
            `чистка реестра: удалено ${pruned.deleted}, не удалось ${pruned.failed} ` +
              `(держим по ${KEEP_IMAGES} последних)`,
          )
        }
      }
    } catch (error) {
      // Сбой одного прохода не должен останавливать сведение: следующий
      // проход увидит то же расхождение и попробует снова.
      console.error(`проход сведения не удался: ${(error as Error).message}`)
    }

    ticks += 1
    await new Promise((resolve) => setTimeout(resolve, TICK_MS))
  }

  await pool.end()
  process.exit(0)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
