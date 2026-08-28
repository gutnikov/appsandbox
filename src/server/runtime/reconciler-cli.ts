import { createPool } from '../db/pool.ts'
import { EnvError, env } from '../env.ts'
import { login } from './docker.ts'
import { PLATFORM_PULL_USER } from '../routes/registry.ts'
import { Reconciler } from './reconciler.ts'
import { loadRegistrySigningKey } from '../registry/key.ts'
import { KEEP_IMAGES, pruneImages } from './images.ts'

/** Как часто сверяем желаемое с фактическим. */
const TICK_MS = 3_000

/** Ограничения на сэндбокс. Сервер маленький, поэтому они тесные. */
const LIMITS = { memoryMb: 160, cpus: 0.5, network: 'zerotomvp-sandboxes' }
const MAX_RUNNING = 3
const LIFETIME_MS = 30 * 60 * 1000
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

  // Образы сэндбоксов лежат в закрытом реестре: внутренним службам платформы
  // выдаётся доступ только на чтение.
  await login(config.REGISTRY_HOST, PLATFORM_PULL_USER, config.REGISTRY_PULL_SECRET)

  const signing = await loadRegistrySigningKey(
    config.REGISTRY_TOKEN_KEY,
    config.REGISTRY_TOKEN_KID,
  )

  const reconciler = new Reconciler({
    env: config,
    pool,
    limits: LIMITS,
    maxRunning: MAX_RUNNING,
    lifetimeMs: LIFETIME_MS,
  })

  console.log(
    `сведение состояний запущено: не больше ${MAX_RUNNING} одновременно, ` +
      `${LIMITS.memoryMb} МБ и ${LIMITS.cpus} процессора на сэндбокс, ` +
      `время жизни ${LIFETIME_MS / 60000} мин`,
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
