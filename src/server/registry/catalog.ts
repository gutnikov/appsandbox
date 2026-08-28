import type { Fetch } from '../github/oauth.ts'
import { type SigningKey, issueRegistryToken } from './token.ts'

/** Состояние образа сэндбокса в нашем реестре. */
export type ImageState = 'present' | 'absent' | 'unknown'

export type CatalogDeps = {
  signing: SigningKey
  /** Издатель токенов — тот же, что настроен в реестре. */
  issuer: string
  /** Имя сервиса реестра, оно же аудитория токена. */
  service: string
  /** Внутренний адрес реестра: ходим напрямую, минуя прокси. */
  baseUrl: string
  fetchImpl?: Fetch
}

/**
 * Платформа сама себе выписывает токен на чтение: она же издатель, которому
 * реестр доверяет. Отдельных учётных данных для этого заводить не нужно.
 */
export async function imageState(deps: CatalogDeps, name: string): Promise<ImageState> {
  const fetchImpl = deps.fetchImpl ?? fetch

  const { token } = await issueRegistryToken({
    signing: deps.signing,
    issuer: deps.issuer,
    service: deps.service,
    subject: 'platform',
    access: [{ type: 'repository', name, actions: ['pull'] }],
    ttlSeconds: 60,
  })

  let response: Response
  try {
    response = await fetchImpl(`${deps.baseUrl}/v2/${name}/tags/list`, {
      headers: { authorization: `Bearer ${token}` },
    })
  } catch {
    // Реестр недоступен — это не то же самое, что «образа нет».
    return 'unknown'
  }

  if (response.status === 404) return 'absent'
  if (!response.ok) return 'unknown'

  const body = (await response.json().catch(() => null)) as { tags?: string[] | null } | null
  if (!body) return 'unknown'

  return (body.tags?.length ?? 0) > 0 ? 'present' : 'absent'
}
