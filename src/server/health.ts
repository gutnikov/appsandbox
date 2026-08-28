export type HealthCheck = {
  name: string
  probe: () => Promise<void>
}

export type HealthReport = {
  status: 'ok' | 'degraded'
  checks: Record<string, 'ok' | 'fail'>
}

const checks: HealthCheck[] = []

/** Регистрирует проверку готовности. Пока не пройдут все — сервис не готов. */
export function registerHealthCheck(check: HealthCheck): void {
  checks.push(check)
}

export async function runHealthChecks(): Promise<HealthReport> {
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
