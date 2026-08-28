import { describe, expect, it, vi } from 'vitest'
import { createNonce, safeEqual, sign, verify } from './signing.ts'

const SECRET = 'test-secret-at-least-32-characters-long'
const TTL = 10 * 60 * 1000

describe('подпись состояния авторизации', () => {
  it('проверяет то, что сама подписала', () => {
    const payload = { nonce: createNonce(), iat: Date.now() }
    const result = verify(SECRET, sign(SECRET, payload), TTL)

    expect(result).toMatchObject({ ok: true, payload: { nonce: payload.nonce } })
  })

  it('отвергает подпись, сделанную другим ключом', () => {
    const token = sign('другой-ключ-длиной-не-меньше-32-символов', {
      nonce: createNonce(),
      iat: Date.now(),
    })

    expect(verify(SECRET, token, TTL)).toMatchObject({ ok: false, reason: 'bad_signature' })
  })

  it('отвергает подделанное содержимое', () => {
    const token = sign(SECRET, { nonce: 'first', iat: Date.now() })
    const [, signature] = token.split('.')
    const forged = `${Buffer.from(JSON.stringify({ nonce: 'second', iat: Date.now() })).toString('base64url')}.${signature}`

    expect(verify(SECRET, forged, TTL)).toMatchObject({ ok: false, reason: 'bad_signature' })
  })

  it('отвергает просроченное состояние', () => {
    vi.useFakeTimers()
    try {
      const token = sign(SECRET, { nonce: createNonce(), iat: Date.now() })
      vi.advanceTimersByTime(TTL + 1)
      expect(verify(SECRET, token, TTL)).toMatchObject({ ok: false, reason: 'expired' })
    } finally {
      vi.useRealTimers()
    }
  })

  it('отвергает мусор', () => {
    for (const token of ['', 'нет-точки', '.', 'a.b.c']) {
      expect(verify(SECRET, token, TTL).ok, token).toBe(false)
    }
  })

  it('выдаёт разные nonce', () => {
    expect(createNonce()).not.toBe(createNonce())
  })

  it('сравнивает строки без утечки по времени', () => {
    expect(safeEqual('abc', 'abc')).toBe(true)
    expect(safeEqual('abc', 'abd')).toBe(false)
    expect(safeEqual('abc', 'abcd')).toBe(false)
  })
})
