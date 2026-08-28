import { createRemoteJWKSet, jwtVerify } from 'jose'
import { GITHUB_OIDC_ISSUER, OIDC_AUDIENCE } from '../../shared/registry.ts'

const JWKS_URL = new URL(`${GITHUB_OIDC_ISSUER}/.well-known/jwks`)

export class OidcError extends Error {
  readonly reason: string

  constructor(reason: string, message: string) {
    super(message)
    this.name = 'OidcError'
    this.reason = reason
  }
}

export type WorkflowIdentity = {
  /** Репозиторий-источник в виде owner/repo. */
  repository: string
  repositoryOwner: string
  /** Значение sub — годится для журналирования. */
  subject: string
}

export type JwksResolver = Parameters<typeof jwtVerify>[1]

/**
 * Ключи GitHub кешируются и обновляются самим jose: он ходит за JWKS только
 * когда встречает незнакомый kid, с защитой от частых повторов.
 */
export function createGitHubJwks(): JwksResolver {
  return createRemoteJWKSet(JWKS_URL) as unknown as JwksResolver
}

export type VerifyOptions = {
  jwks: JwksResolver
  audience?: string
  issuer?: string
}

/**
 * Проверяет удостоверение запуска GitHub Actions: подпись, издателя,
 * аудиторию и срок действия. Ничему в теле токена не верим до проверки
 * подписи — репозиторий берём только из проверенных claim'ов.
 */
export async function verifyWorkflowIdentity(
  token: string,
  options: VerifyOptions,
): Promise<WorkflowIdentity> {
  let payload
  try {
    ;({ payload } = await jwtVerify(token, options.jwks, {
      issuer: options.issuer ?? GITHUB_OIDC_ISSUER,
      audience: options.audience ?? OIDC_AUDIENCE,
      algorithms: ['RS256'],
    }))
  } catch (error) {
    const code = (error as { code?: string }).code ?? 'invalid'
    throw new OidcError(mapReason(code), `Удостоверение запуска не принято: ${code}`)
  }

  const repository = payload.repository
  const repositoryOwner = payload.repository_owner

  if (typeof repository !== 'string' || typeof repositoryOwner !== 'string') {
    throw new OidcError('no_repository', 'В удостоверении нет репозитория-источника')
  }

  return {
    repository,
    repositoryOwner,
    subject: typeof payload.sub === 'string' ? payload.sub : '',
  }
}

function mapReason(code: string): string {
  if (code === 'ERR_JWT_EXPIRED') return 'expired'
  if (code === 'ERR_JWT_CLAIM_VALIDATION_FAILED') return 'claim_mismatch'
  if (code === 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED') return 'bad_signature'
  if (code === 'ERR_JWKS_NO_MATCHING_KEY') return 'unknown_key'
  return 'invalid'
}
