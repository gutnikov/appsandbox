const AUTHORIZE_URL = 'https://github.com/login/oauth/authorize'
const TOKEN_URL = 'https://github.com/login/oauth/access_token'
const VIEWER_URL = 'https://api.github.com/user'

/**
 * Минимальный достаточный доступ: создать публичный репозиторий в аккаунте
 * пользователя. Приватные репозитории, организации, вебхуки и секреты не
 * запрашиваются — экран согласия не должен пугать.
 */
export const OAUTH_SCOPE = 'public_repo'

export type Fetch = typeof globalThis.fetch

export type OAuthConfig = {
  clientId: string
  clientSecret: string
  redirectUri: string
}

export function buildAuthorizeUrl(config: OAuthConfig, state: string): string {
  const url = new URL(AUTHORIZE_URL)
  url.searchParams.set('client_id', config.clientId)
  url.searchParams.set('redirect_uri', config.redirectUri)
  url.searchParams.set('scope', OAUTH_SCOPE)
  url.searchParams.set('state', state)
  return url.toString()
}

export class GitHubAuthError extends Error {
  readonly reason: string

  constructor(reason: string, message: string) {
    super(message)
    this.name = 'GitHubAuthError'
    this.reason = reason
  }
}

type TokenResponse = {
  access_token?: string
  scope?: string
  token_type?: string
  error?: string
  error_description?: string
}

/**
 * Меняет код на токен. Токен возвращается вызывающему и живёт только в
 * пределах обработки одного запроса — нигде не сохраняется и не логируется.
 */
export async function exchangeCodeForToken(
  config: OAuthConfig,
  code: string,
  fetchImpl: Fetch = fetch,
): Promise<string> {
  const response = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      code,
    }),
  })

  if (!response.ok) {
    throw new GitHubAuthError('token_http_error', `GitHub ответил ${response.status} на обмен кода`)
  }

  const body = (await response.json()) as TokenResponse
  if (body.error || !body.access_token) {
    throw new GitHubAuthError(body.error ?? 'no_token', 'GitHub не выдал токен доступа')
  }

  return body.access_token
}

export type Viewer = {
  login: string
}

export async function fetchViewer(token: string, fetchImpl: Fetch = fetch): Promise<Viewer> {
  const response = await fetchImpl(VIEWER_URL, {
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'user-agent': 'zerotomvp',
      'x-github-api-version': '2022-11-28',
    },
  })

  if (!response.ok) {
    throw new GitHubAuthError('viewer_http_error', `GitHub ответил ${response.status} на /user`)
  }

  const body = (await response.json()) as { login?: string }
  if (!body.login) throw new GitHubAuthError('no_login', 'GitHub не вернул логин пользователя')

  return { login: body.login }
}
