import { describe, expect, it } from 'vitest'
import type { Env } from '../env.ts'
import { createApp } from '../app.ts'
import { testEnv } from '../testing/env.ts'
import type { Provision } from './auth.ts'

const TOKEN = 'gho_secret_access_token_value'

type Harness = {
  app: ReturnType<typeof createApp>
  githubCalls: string[]
}

function harness(options: { env?: Partial<Env>; provision?: Provision } = {}): Harness {
  const githubCalls: string[] = []

  const fetchImpl = (async (input: string | URL | Request) => {
    const url = String(input)
    githubCalls.push(url)

    if (url.includes('/login/oauth/access_token')) {
      return new Response(JSON.stringify({ access_token: TOKEN }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    if (url.includes('api.github.com/user')) {
      return new Response(JSON.stringify({ login: 'octocat' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    throw new Error(`Неожиданный запрос в тесте: ${url}`)
  }) as unknown as typeof fetch

  const provision: Provision =
    options.provision ??
    (async () => ({
      name: 'sandbox-brave-otter',
      repoUrl: 'https://github.com/octocat/sandbox-brave-otter',
    }))

  return {
    app: createApp({
      env: testEnv(options.env),
      healthChecks: [],
      provision,
      fetchImpl,
    }),
    githubCalls,
  }
}

/** Начинает авторизацию и возвращает state вместе с кукой для callback. */
async function startAuth(h: Harness) {
  const response = await h.app.request('/api/auth/github')
  const location = new URL(response.headers.get('location') as string)
  const setCookie = response.headers.get('set-cookie') as string
  const cookie = setCookie.split(';')[0] as string

  return { response, setCookie, cookie, state: location.searchParams.get('state') as string }
}

describe('старт авторизации', () => {
  it('ведёт на GitHub и запрашивает только public_repo', async () => {
    const response = await harness().app.request('/api/auth/github')

    expect(response.status).toBe(302)
    const location = new URL(response.headers.get('location') as string)
    expect(location.origin + location.pathname).toBe('https://github.com/login/oauth/authorize')
    expect(location.searchParams.get('scope')).toBe('public_repo')
    expect(location.searchParams.get('client_id')).toBe('client-id')
    expect(location.searchParams.get('state')).toBeTruthy()
  })

  it('кладёт state в куку без Domain, host-only', async () => {
    const { setCookie } = await startAuth(harness())

    expect(setCookie.toLowerCase()).not.toContain('domain=')
    expect(setCookie).toMatch(/HttpOnly/i)
    expect(setCookie).toMatch(/SameSite=Lax/i)
    expect(setCookie).toMatch(/Secure/i)
    // Префикс перекладывает host-only на браузер: с поддомена такую куку не подсунуть.
    expect(setCookie).toMatch(/^__Host-/)
  })

  it('по http (локальная разработка) обходится без префикса __Host-', async () => {
    const { setCookie } = await startAuth(
      harness({ env: { PUBLIC_BASE_URL: 'http://localhost:5173' } }),
    )

    expect(setCookie).not.toMatch(/^__Host-/)
    expect(setCookie.toLowerCase()).not.toContain('domain=')
  })

  it('каждый раз выдаёт новый state', async () => {
    const h = harness()
    const first = await startAuth(h)
    const second = await startAuth(h)

    expect(first.state).not.toBe(second.state)
  })
})

describe('возврат с GitHub', () => {
  it('создаёт сэндбокс и ведёт на страницу результата', async () => {
    const h = harness()
    const { cookie, state } = await startAuth(h)

    const response = await h.app.request(`/api/auth/github/callback?code=abc&state=${state}`, {
      headers: { cookie },
    })

    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('/created?name=sandbox-brave-otter')
  })

  it('не отдаёт токен ни в редиректе, ни в куках', async () => {
    const h = harness()
    const { cookie, state } = await startAuth(h)

    const response = await h.app.request(`/api/auth/github/callback?code=abc&state=${state}`, {
      headers: { cookie },
    })

    const headers = [...response.headers.entries()].map(([k, v]) => `${k}: ${v}`).join('\n')
    expect(headers).not.toContain(TOKEN)
    expect(await response.text()).not.toContain(TOKEN)
  })

  it('отказ пользователя объясняется отдельно', async () => {
    const h = harness()
    const { cookie } = await startAuth(h)
    h.githubCalls.length = 0

    const response = await h.app.request('/api/auth/github/callback?error=access_denied', {
      headers: { cookie },
    })

    expect(response.headers.get('location')).toBe('/error?reason=denied')
    expect(h.githubCalls).toEqual([])
  })

  it('без куки за токеном не ходит', async () => {
    const h = harness()
    const { state } = await startAuth(h)
    h.githubCalls.length = 0

    const response = await h.app.request(`/api/auth/github/callback?code=abc&state=${state}`)

    expect(response.headers.get('location')).toBe('/error?reason=state')
    expect(h.githubCalls).toEqual([])
  })

  it('несовпадающий state отвергается без обращения к GitHub', async () => {
    const h = harness()
    const { cookie } = await startAuth(h)
    h.githubCalls.length = 0

    const response = await h.app.request('/api/auth/github/callback?code=abc&state=подделка', {
      headers: { cookie },
    })

    expect(response.headers.get('location')).toBe('/error?reason=state')
    expect(h.githubCalls).toEqual([])
  })

  it('state одноразовый: кука снимается тем же ответом', async () => {
    const h = harness()
    const { cookie, state } = await startAuth(h)

    const first = await h.app.request(`/api/auth/github/callback?code=abc&state=${state}`, {
      headers: { cookie },
    })
    expect(first.headers.get('set-cookie')).toMatch(/Max-Age=0|Expires=/i)

    // Повтор без куки — браузер её уже не пришлёт.
    h.githubCalls.length = 0
    const replay = await h.app.request(`/api/auth/github/callback?code=abc&state=${state}`)
    expect(replay.headers.get('location')).toBe('/error?reason=state')
    expect(h.githubCalls).toEqual([])
  })

  it('кука от чужого цикла авторизации не подходит', async () => {
    const h = harness()
    const first = await startAuth(h)
    const second = await startAuth(h)

    const response = await h.app.request(
      `/api/auth/github/callback?code=abc&state=${second.state}`,
      { headers: { cookie: first.cookie } },
    )

    expect(response.headers.get('location')).toBe('/error?reason=state')
  })

  it('сбой создания сэндбокса объясняется без сырого ответа GitHub', async () => {
    const h = harness({
      provision: async () => {
        const error = new Error('GitHub ответил 503 на создание репозитория')
        error.name = 'GitHubApiError'
        throw error
      },
    })
    const { cookie, state } = await startAuth(h)

    const response = await h.app.request(`/api/auth/github/callback?code=abc&state=${state}`, {
      headers: { cookie },
    })

    expect(response.headers.get('location')).toBe('/error?reason=github')
  })

  it('исчерпание имён объясняется отдельно', async () => {
    const h = harness({
      provision: async () => {
        const error = new Error('нет свободных имён')
        error.name = 'NameExhaustedError'
        throw error
      },
    })
    const { cookie, state } = await startAuth(h)

    const response = await h.app.request(`/api/auth/github/callback?code=abc&state=${state}`, {
      headers: { cookie },
    })

    expect(response.headers.get('location')).toBe('/error?reason=names_exhausted')
  })
})
