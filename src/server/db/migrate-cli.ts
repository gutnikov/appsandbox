import { EnvError, env } from '../env.ts'
import { migrate } from './migrate.ts'
import { createPool } from './pool.ts'

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
  try {
    const { applied, skipped } = await migrate(pool)
    for (const version of skipped) console.log(`= ${version}`)
    for (const version of applied) console.log(`+ ${version}`)
    console.log(applied.length ? `Применено миграций: ${applied.length}` : 'Новых миграций нет')
  } finally {
    await pool.end()
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
