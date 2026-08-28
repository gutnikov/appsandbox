import { Hono, type Context } from 'hono'
import { safeEqual } from '../auth/signing.ts'
import type { Env } from '../env.ts'
import { OidcError, type JwksResolver, verifyWorkflowIdentity } from '../registry/oidc.ts'
import { grantOnly, parseScopes } from '../registry/scope.ts'
import { type SigningKey, issueRegistryToken } from '../registry/token.ts'

export type SandboxLookup = (repoFullName: string) => Promise<
  { name: string; githubLogin: string } | undefined
>

export type RegistryRoutesDeps = {
  env: Env
  jwks: JwksResolver
  signing: SigningKey
  lookupSandbox: SandboxLookup
  /** Подменяется в тестах, чтобы не засорять вывод. */
  log?: (message: string) => void
}

/**
 * Отказ клиенту всегда один и тот же, а причина нужна оператору: без неё
 * «нет прав на публикацию» неотличимо от испорченной подписи, отсутствующей
 * записи о сэндбоксе и чужого владельца.
 */
type DenyReason =
  | 'no_credentials'
  | 'bad_identity'
  | 'bad_platform_secret'
  | 'unknown_sandbox'
  | 'owner_mismatch'

/** Логин платформы, под которым внутренние службы скачивают образы. */
export const PLATFORM_PULL_USER = 'platform'

type Credential = { user: string; password: string }

function readCredential(header: string | undefined): Credential | undefined {
  if (!header?.toLowerCase().startsWith('basic ')) return undefined
  const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8')
  const separator = decoded.indexOf(':')
  if (separator < 0) return undefined
  const password = decoded.slice(separator + 1)
  if (!password) return undefined
  return { user: decoded.slice(0, separator), password }
}

/**
 * Внутренним службам даём чтение и удаление, но не запись: публиковать
 * образы вправе только сборка в репозитории владельца.
 */
const PLATFORM_ACTIONS = ['pull', 'delete']

function platformAccess(requests: readonly { type: string; name: string; actions: string[] }[]) {
  return requests
    .filter((request) => request.type === 'repository' && request.name)
    .map((request) => ({
      type: 'repository',
      name: request.name,
      actions: request.actions.filter((action) => PLATFORM_ACTIONS.includes(action)),
    }))
    .filter((request) => request.actions.length > 0)
}

export function createRegistryRoutes(deps: RegistryRoutesDeps) {
  const routes = new Hono()
  const log = deps.log ?? ((message: string) => console.warn(message))

  const deny = (c: Context, service: string, reason: DenyReason, detail = '') => {
    log(`реестр: отказ (${reason})${detail ? ` ${detail}` : ''}`)
    return unauthorized(c, service)
  }

  routes.get('/token', async (c) => {
    const service = c.req.query('service') ?? deps.env.REGISTRY_HOST
    const scopes = c.req.queries('scope') ?? []

    const credential = readCredential(c.req.header('authorization'))
    if (!credential) {
      // Анонимный доступ к реестру закрыт полностью: ни чтения, ни списка.
      return deny(c, service, 'no_credentials')
    }

    // Внутренняя служба платформы: только чтение, зато любого образа.
    if (credential.user === PLATFORM_PULL_USER) {
      if (!safeEqual(credential.password, deps.env.REGISTRY_PULL_SECRET)) {
        return deny(c, service, 'bad_platform_secret')
      }

      const issued = await issueRegistryToken({
        signing: deps.signing,
        issuer: deps.env.PUBLIC_BASE_URL,
        service,
        subject: PLATFORM_PULL_USER,
        access: platformAccess(parseScopes(scopes)),
      })

      return c.json({
        token: issued.token,
        access_token: issued.token,
        expires_in: issued.expiresIn,
        issued_at: issued.issuedAt,
      })
    }

    let identity
    try {
      identity = await verifyWorkflowIdentity(credential.password, { jwks: deps.jwks })
    } catch (error) {
      if (error instanceof OidcError) return deny(c, service, 'bad_identity', error.reason)
      throw error
    }

    // Репозиторий из удостоверения должен соответствовать созданному сэндбоксу.
    const sandbox = await deps.lookupSandbox(identity.repository)
    if (!sandbox) return deny(c, service, 'unknown_sandbox', identity.repository)

    // Владелец репозитория обязан совпадать с владельцем сэндбокса: иначе
    // форк чужого сэндбокса получил бы право писать в чужой образ.
    if (identity.repositoryOwner !== sandbox.githubLogin) {
      return deny(c, service, 'owner_mismatch', `${identity.repository} ≠ ${sandbox.githubLogin}`)
    }

    const access = grantOnly(parseScopes(scopes), sandbox.name)

    const issued = await issueRegistryToken({
      signing: deps.signing,
      issuer: deps.env.PUBLIC_BASE_URL,
      service,
      subject: sandbox.name,
      access,
    })

    return c.json({
      token: issued.token,
      access_token: issued.token,
      expires_in: issued.expiresIn,
      issued_at: issued.issuedAt,
    })
  })

  return routes
}

function unauthorized(c: Context, service: string) {
  c.header('www-authenticate', `Basic realm="${service}"`)
  return c.json({ errors: [{ code: 'UNAUTHORIZED', message: 'нет прав на публикацию' }] }, 401)
}
