import type { Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'

const BASE_NAME = 'zt_oauth_state'

/**
 * Поддомены `*.zerotomvp.xyz` отдаются под код пользователей, поэтому кука
 * платформы обязана быть host-only. Префикс `__Host-` перекладывает этот
 * инвариант на браузер: такую куку нельзя выставить с атрибутом Domain и
 * нельзя подсунуть с поддомена (cookie tossing).
 *
 * Префикс требует Secure, поэтому в локальной разработке по http он не
 * используется — там остаётся обычное имя без Domain.
 */
export function stateCookieName(secure: boolean): string {
  return secure ? `__Host-${BASE_NAME}` : BASE_NAME
}

export type CookieOptions = {
  secure: boolean
  maxAgeSeconds: number
}

export function setStateCookie(c: Context, value: string, options: CookieOptions): void {
  setCookie(c, stateCookieName(options.secure), value, {
    path: '/',
    httpOnly: true,
    secure: options.secure,
    // Lax, а не Strict: куку должен прислать браузер при возврате с GitHub,
    // а это межсайтовая навигация верхнего уровня.
    sameSite: 'Lax',
    maxAge: options.maxAgeSeconds,
    // Domain не задаётся намеренно: кука должна остаться host-only.
  })
}

export function readStateCookie(c: Context, secure: boolean): string | undefined {
  return getCookie(c, stateCookieName(secure))
}

export function clearStateCookie(c: Context, secure: boolean): void {
  deleteCookie(c, stateCookieName(secure), { path: '/', secure, sameSite: 'Lax' })
}
