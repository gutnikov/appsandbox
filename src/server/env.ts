import { z } from 'zod'

/**
 * Конфигурация читается один раз при старте. Если чего-то не хватает,
 * процесс не должен начать обслуживать запросы частично сконфигурированном виде —
 * поэтому здесь бросается ошибка, перечисляющая все проблемные переменные.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  PUBLIC_BASE_URL: z.url(),

  GITHUB_CLIENT_ID: z.string().min(1),
  GITHUB_CLIENT_SECRET: z.string().min(1),
  GITHUB_OAUTH_REDIRECT_URI: z.url(),

  TEMPLATE_REPO: z.string().regex(/^[\w.-]+\/[\w.-]+$/, 'ожидается owner/repo'),

  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32, 'нужно не меньше 32 символов'),

  REGISTRY_HOST: z.string().min(1),
  REGISTRY_TOKEN_KEY: z.string().min(1),
})

export type Env = z.infer<typeof schema>

export class EnvError extends Error {
  readonly missing: string[]

  constructor(missing: string[], message: string) {
    super(message)
    this.name = 'EnvError'
    this.missing = missing
  }
}

export function parseEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = schema.safeParse(source)
  if (result.success) return result.data

  // Значения переменных сюда не попадают: только имена и причина.
  const problems = result.error.issues.map((issue) => {
    const name = issue.path.join('.') || '<корень>'
    const absent = source[name] === undefined || source[name] === ''
    return `  ${name}: ${absent ? 'не задана' : issue.message}`
  })
  const names = result.error.issues.map((issue) => String(issue.path[0] ?? ''))

  throw new EnvError(
    names,
    `Конфигурация окружения неполна или некорректна:\n${problems.join('\n')}`,
  )
}

let cached: Env | undefined

export function env(): Env {
  cached ??= parseEnv()
  return cached
}
