import { Hono } from 'hono'
import type { Env } from '../env.ts'
import {
  clearStateCookie,
  readStateCookie,
  setStateCookie,
} from '../auth/cookies.ts'
import { createNonce, safeEqual, sign, verify } from '../auth/signing.ts'
import {
  GitHubAuthError,
  type Fetch,
  type OAuthConfig,
  buildAuthorizeUrl,
  exchangeCodeForToken,
  fetchViewer,
} from '../github/oauth.ts'
import type { FailureReason } from '../../shared/errors.ts'

/** Сколько живёт начатый цикл авторизации. */
export const STATE_TTL_MS = 10 * 60 * 1000

export type ProvisionResult = {
  name: string
  repoUrl: string
}

/**
 * Создание сэндбокса. Передаётся зависимостью: маршруты авторизации не
 * должны знать, как именно порождается репозиторий.
 */
export type Provision = (input: {
  login: string
  token: string
}) => Promise<ProvisionResult>

export type AuthRoutesDeps = {
  env: Env
  provision: Provision
  fetchImpl?: Fetch
}

function oauthConfig(env: Env): OAuthConfig {
  return {
    clientId: env.GITHUB_CLIENT_ID,
    clientSecret: env.GITHUB_CLIENT_SECRET,
    redirectUri: env.GITHUB_OAUTH_REDIRECT_URI,
  }
}

export function isSecureOrigin(env: Env): boolean {
  return env.PUBLIC_BASE_URL.startsWith('https://')
}

export function createAuthRoutes({ env, provision, fetchImpl }: AuthRoutesDeps) {
  const routes = new Hono()
  const secure = isSecureOrigin(env)

  const fail = (reason: FailureReason) => `/error?reason=${reason}`

  routes.get('/github', (c) => {
    const nonce = createNonce()
    const token = sign(env.SESSION_SECRET, { nonce, iat: Date.now() })

    setStateCookie(c, token, { secure, maxAgeSeconds: STATE_TTL_MS / 1000 })

    return c.redirect(buildAuthorizeUrl(oauthConfig(env), nonce), 302)
  })

  routes.get('/github/callback', async (c) => {
    const cookie = readStateCookie(c, secure)

    // State одноразовый: снимаем куку до любых проверок, чтобы повторный
    // заход по тому же callback уже ничего не нашёл.
    clearStateCookie(c, secure)

    if (c.req.query('error')) return c.redirect(fail('denied'), 302)

    const state = c.req.query('state')
    if (!cookie || !state) return c.redirect(fail('state'), 302)

    const verified = verify(env.SESSION_SECRET, cookie, STATE_TTL_MS)
    if (!verified.ok || !safeEqual(verified.payload.nonce, state)) {
      return c.redirect(fail('state'), 302)
    }

    const code = c.req.query('code')
    if (!code) return c.redirect(fail('state'), 302)

    let result: ProvisionResult
    try {
      // Токен живёт только внутри этого блока: он не пишется в базу,
      // не кладётся в куку и не отдаётся браузеру.
      const token = await exchangeCodeForToken(oauthConfig(env), code, fetchImpl)
      const viewer = await fetchViewer(token, fetchImpl)
      result = await provision({ login: viewer.login, token })
    } catch (error) {
      return c.redirect(fail(reasonFor(error)), 302)
    }

    const target = new URL('/created', env.PUBLIC_BASE_URL)
    target.searchParams.set('name', result.name)
    return c.redirect(target.pathname + target.search, 302)
  })

  return routes
}

function reasonFor(error: unknown): FailureReason {
  if (error instanceof GitHubAuthError) return 'github'
  if (error instanceof Error && error.name === 'NameExhaustedError') return 'names_exhausted'
  if (error instanceof Error && error.name === 'GitHubApiError') return 'github'
  return 'internal'
}
