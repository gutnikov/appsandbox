import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

const SEPARATOR = '.'

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url')
}

function hmac(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url')
}

export type SignedPayload = {
  /** Случайное значение, которое и есть сам state. */
  nonce: string
  /** Момент выпуска, миллисекунды эпохи. */
  iat: number
}

export function createNonce(): string {
  return randomBytes(32).toString('base64url')
}

/** Подписывает значение так, чтобы его нельзя было подделать снаружи. */
export function sign(secret: string, payload: SignedPayload): string {
  const body = base64url(JSON.stringify(payload))
  return `${body}${SEPARATOR}${hmac(secret, body)}`
}

export type VerifyResult =
  | { ok: true; payload: SignedPayload }
  | { ok: false; reason: 'malformed' | 'bad_signature' | 'expired' }

export function verify(secret: string, token: string, maxAgeMs: number): VerifyResult {
  const separatorAt = token.lastIndexOf(SEPARATOR)
  if (separatorAt <= 0) return { ok: false, reason: 'malformed' }

  const body = token.slice(0, separatorAt)
  const signature = token.slice(separatorAt + 1)

  const expected = Buffer.from(hmac(secret, body))
  const actual = Buffer.from(signature)
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return { ok: false, reason: 'bad_signature' }
  }

  let payload: SignedPayload
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SignedPayload
  } catch {
    return { ok: false, reason: 'malformed' }
  }

  if (typeof payload?.nonce !== 'string' || typeof payload?.iat !== 'number') {
    return { ok: false, reason: 'malformed' }
  }
  if (Date.now() - payload.iat > maxAgeMs) return { ok: false, reason: 'expired' }

  return { ok: true, payload }
}

/** Сравнение, не зависящее от времени: state приходит снаружи. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}
