import {
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  exportPKCS8,
  generateKeyPair,
  jwtVerify,
  type JWK,
} from 'jose'
import { beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../app.ts'
import { loadRegistrySigningKey } from '../registry/key.ts'
import type { JwksResolver } from '../registry/oidc.ts'
import type { SigningKey } from '../registry/token.ts'
import { testEnv } from '../testing/env.ts'
import { GITHUB_OIDC_ISSUER, OIDC_AUDIENCE } from '../../shared/registry.ts'
import { createRegistryRoutes, type SandboxLookup } from './registry.ts'

const SANDBOX = { name: 'sandbox-brave-otter', githubLogin: 'octocat' }
const REPO = `${SANDBOX.githubLogin}/${SANDBOX.name}`
const KID = 'test-key'

// Подделываем издателя GitHub: свой ключ, свой JWKS.
let githubKey: CryptoKey
let strangerKey: CryptoKey
let jwks: JwksResolver
let signing: SigningKey
let registryPublicJwk: JWK

beforeAll(async () => {
  const github = await generateKeyPair('RS256', { extractable: true })
  const stranger = await generateKeyPair('RS256', { extractable: true })
  githubKey = github.privateKey
  strangerKey = stranger.privateKey

  jwks = createLocalJWKSet({
    keys: [{ ...(await exportJWK(github.publicKey)), kid: 'github-1', alg: 'RS256' }],
  }) as unknown as JwksResolver

  const registryPair = await generateKeyPair('ES256', { extractable: true })
  registryPublicJwk = await exportJWK(registryPair.publicKey)
  signing = await loadRegistrySigningKey(await exportPKCS8(registryPair.privateKey), KID)
})

type IdentityOverrides = {
  audience?: string
  issuer?: string
  repository?: string
  repositoryOwner?: string
  expiresAt?: string | number
  key?: CryptoKey
}

async function identityToken(overrides: IdentityOverrides = {}): Promise<string> {
  return new SignJWT({
    repository: overrides.repository ?? REPO,
    repository_owner: overrides.repositoryOwner ?? SANDBOX.githubLogin,
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'github-1' })
    .setIssuer(overrides.issuer ?? GITHUB_OIDC_ISSUER)
    .setAudience(overrides.audience ?? OIDC_AUDIENCE)
    .setSubject(`repo:${REPO}:ref:refs/heads/main`)
    .setIssuedAt()
    .setExpirationTime(overrides.expiresAt ?? '5m')
    .sign(overrides.key ?? githubKey)
}

function app(lookup?: SandboxLookup) {
  const env = testEnv()
  const lookupSandbox: SandboxLookup =
    lookup ?? (async (repo) => (repo === REPO ? SANDBOX : undefined))

  return createApp({
    env,
    healthChecks: [],
    provision: async () => ({ name: 'unused', repoUrl: 'unused' }),
    registryRoutes: createRegistryRoutes({ env, jwks, signing, lookupSandbox }),
  })
}

function basic(token: string): Record<string, string> {
  return { authorization: `Basic ${Buffer.from(`oidc:${token}`).toString('base64')}` }
}

async function requestToken(
  token: string | undefined,
  scope = `repository:${SANDBOX.name}:push,pull`,
) {
  const url = `/api/registry/token?service=registry.zerotomvp.xyz&scope=${encodeURIComponent(scope)}`
  return app().request(url, { headers: token ? basic(token) : {} })
}

async function decode(body: { token: string }) {
  const { payload, protectedHeader } = await jwtVerify(body.token, registryPublicJwk)
  return { payload, protectedHeader }
}

describe('выдача прав реестру', () => {
  it('по действующему удостоверению выдаёт право на свой образ', async () => {
    const response = await requestToken(await identityToken())
    expect(response.status).toBe(200)

    const body = (await response.json()) as { token: string; expires_in: number }
    const { payload, protectedHeader } = await decode(body)

    expect(protectedHeader.kid).toBe(KID)
    expect(payload.iss).toBe('https://zerotomvp.xyz')
    expect(payload.aud).toBe('registry.zerotomvp.xyz')
    expect(payload.sub).toBe(SANDBOX.name)
    expect(payload.access).toEqual([
      { type: 'repository', name: SANDBOX.name, actions: ['push', 'pull'] },
    ])
  })

  it('токен короткоживущий и с полями против повтора', async () => {
    const response = await requestToken(await identityToken())
    const body = (await response.json()) as { token: string; expires_in: number }
    const { payload } = await decode(body)

    expect(body.expires_in).toBeGreaterThan(0)
    expect(body.expires_in).toBeLessThanOrEqual(600)
    expect(payload.exp).toBeDefined()
    expect(payload.nbf).toBeDefined()
    expect(payload.iat).toBeDefined()
    expect(payload.jti).toBeDefined()
    expect((payload.exp as number) - (payload.iat as number)).toBe(body.expires_in)
  })

  it('каждый выпуск получает свой jti', async () => {
    const first = await decode((await (await requestToken(await identityToken())).json()) as never)
    const second = await decode((await (await requestToken(await identityToken())).json()) as never)

    expect(first.payload.jti).not.toBe(second.payload.jti)
  })
})

describe('отказы', () => {
  it('без учётных данных доступа нет', async () => {
    const response = await requestToken(undefined)

    expect(response.status).toBe(401)
    expect(response.headers.get('www-authenticate')).toMatch(/^Basic realm=/)
  })

  it('чужая аудитория не принимается', async () => {
    const response = await requestToken(await identityToken({ audience: 'someone-else' }))
    expect(response.status).toBe(401)
  })

  it('чужой издатель не принимается', async () => {
    const response = await requestToken(await identityToken({ issuer: 'https://evil.example' }))
    expect(response.status).toBe(401)
  })

  it('истёкшее удостоверение не принимается', async () => {
    const response = await requestToken(
      await identityToken({ expiresAt: Math.floor(Date.now() / 1000) - 60 }),
    )
    expect(response.status).toBe(401)
  })

  it('подпись чужим ключом не принимается', async () => {
    const response = await requestToken(await identityToken({ key: strangerKey }))
    expect(response.status).toBe(401)
  })

  it('репозиторий без записи о сэндбоксе прав не даёт', async () => {
    const response = await requestToken(await identityToken({ repository: 'someone/other-repo' }))
    expect(response.status).toBe(401)
  })

  it('несовпадение владельца прав не даёт: форк не пишет в чужой образ', async () => {
    const url = `/api/registry/token?scope=${encodeURIComponent(`repository:${SANDBOX.name}:push`)}`
    const token = await identityToken({ repositoryOwner: 'forker' })

    const response = await app().request(url, { headers: basic(token) })
    expect(response.status).toBe(401)
  })

  it('запрос прав на чужой образ остаётся без прав', async () => {
    const response = await requestToken(
      await identityToken(),
      'repository:sandbox-someone-else:push,pull',
    )

    expect(response.status).toBe(200)
    const { payload } = await decode((await response.json()) as never)
    expect(payload.access).toEqual([])
  })

  it('действия сверх push и pull отбрасываются', async () => {
    const response = await requestToken(
      await identityToken(),
      `repository:${SANDBOX.name}:push,pull,delete,*`,
    )

    const { payload } = await decode((await response.json()) as never)
    expect(payload.access).toEqual([
      { type: 'repository', name: SANDBOX.name, actions: ['push', 'pull'] },
    ])
  })

  it('docker login без scope проходит, но прав не несёт', async () => {
    const response = await app().request('/api/registry/token?service=registry.zerotomvp.xyz', {
      headers: basic(await identityToken()),
    })

    expect(response.status).toBe(200)
    const { payload } = await decode((await response.json()) as never)
    expect(payload.access).toEqual([])
  })
})
