/** Причины, по которым создание сэндбокса не состоялось. */
export const FAILURE_REASONS = [
  'denied',
  'state',
  'github',
  'names_exhausted',
  'internal',
] as const

export type FailureReason = (typeof FAILURE_REASONS)[number]

export function isFailureReason(value: unknown): value is FailureReason {
  return typeof value === 'string' && (FAILURE_REASONS as readonly string[]).includes(value)
}

/** Тексты для пользователя. Сырые ответы GitHub наружу не выходят. */
export const FAILURE_MESSAGES: Record<FailureReason, string> = {
  denied: 'Без доступа к GitHub сэндбокс создать нельзя.',
  state: 'Сессия авторизации истекла или была нарушена. Попробуйте ещё раз.',
  github: 'GitHub сейчас недоступен. Попробуйте повторить через пару минут.',
  names_exhausted: 'Не удалось подобрать свободное имя. Попробуйте ещё раз.',
  internal: 'Что-то пошло не так на нашей стороне. Попробуйте ещё раз.',
}
