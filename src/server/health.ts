export type HealthCheck = {
  name: string
  probe: () => Promise<void>
}

export type HealthReport = {
  status: 'ok' | 'degraded'
  checks: Record<string, 'ok' | 'fail'>
}

/**
 * Сервис готов, только когда пройдены все проверки. Проверки передаются
 * явно, а не регистрируются глобально: так их видно на сборке приложения
 * и можно подменить в тестах.
 */
export async function runHealthChecks(checks: readonly HealthCheck[]): Promise<HealthReport> {
  const entries = await Promise.all(
    checks.map(async (check) => {
      try {
        await check.probe()
        return [check.name, 'ok'] as const
      } catch {
        return [check.name, 'fail'] as const
      }
    }),
  )

  return {
    status: entries.every(([, state]) => state === 'ok') ? 'ok' : 'degraded',
    checks: Object.fromEntries(entries),
  }
}
