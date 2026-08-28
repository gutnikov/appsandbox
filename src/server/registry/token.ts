import { randomUUID } from 'node:crypto'
import { SignJWT, importPKCS8, type CryptoKey } from 'jose'
import { REGISTRY_TOKEN_TTL_SECONDS } from '../../shared/registry.ts'
import type { AccessRequest } from './scope.ts'

const ALGORITHM = 'ES256'

export type SigningKey = {
  key: CryptoKey
  kid: string
}

/**
 * Ключ хранится как PKCS#8 PEM в переменной окружения. `kid` должен совпадать
 * с идентификатором ключа в JWKS-файле, который читает реестр.
 */
export async function loadSigningKey(pem: string, kid: string): Promise<SigningKey> {
  const key = await importPKCS8(pem, ALGORITHM)
  return { key, kid }
}

export type IssueTokenParams = {
  signing: SigningKey
  /** Кто выпустил — должно совпадать с issuer в конфигурации реестра. */
  issuer: string
  /** Кому предназначен — имя сервиса реестра. */
  service: string
  subject: string
  access: readonly AccessRequest[]
  ttlSeconds?: number
  now?: Date
}

export type IssuedToken = {
  token: string
  expiresIn: number
  issuedAt: string
}

export async function issueRegistryToken(params: IssueTokenParams): Promise<IssuedToken> {
  const now = params.now ?? new Date()
  const ttl = params.ttlSeconds ?? REGISTRY_TOKEN_TTL_SECONDS
  const issuedAtSeconds = Math.floor(now.getTime() / 1000)

  const token = await new SignJWT({ access: params.access })
    .setProtectedHeader({ alg: ALGORITHM, typ: 'JWT', kid: params.signing.kid })
    .setIssuer(params.issuer)
    .setSubject(params.subject)
    .setAudience(params.service)
    .setJti(randomUUID())
    .setIssuedAt(issuedAtSeconds)
    // nbf со сдвигом назад: часы реестра и платформы могут разойтись.
    .setNotBefore(issuedAtSeconds - 30)
    .setExpirationTime(issuedAtSeconds + ttl)
    .sign(params.signing.key)

  return { token, expiresIn: ttl, issuedAt: now.toISOString() }
}
