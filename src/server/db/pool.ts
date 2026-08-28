import { Pool } from 'pg'
import type { HealthCheck } from '../health.ts'

/** Сколько ждём ответа базы в проверке готовности. */
const HEALTH_PROBE_TIMEOUT_MS = 3_000

export function createPool(connectionString: string): Pool {
  const pool = new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  })

  // Простаивающий клиент может получить ошибку от сервера (например, база
  // ушла на перезапуск). Без этого обработчика Node роняет весь процесс:
  // 'error' на EventEmitter без слушателя — необработанное исключение.
  pool.on('error', (error) => {
    console.error(`Ошибка простаивающего соединения с базой: ${error.message}`)
  })

  return pool
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms)
    promise.then(resolve, reject).finally(() => clearTimeout(timer))
  })
}

export function databaseHealthCheck(pool: Pool): HealthCheck {
  return {
    name: 'database',
    probe: async () => {
      // Без ограничения по времени зависшая база подвесила бы и /healthz.
      await withTimeout(
        pool.query('select 1'),
        HEALTH_PROBE_TIMEOUT_MS,
        'база не ответила вовремя',
      )
    },
  }
}
