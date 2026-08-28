import { isValidSandboxName } from '../sandboxes/names.ts'

/** Что платформа знает об имени, запрошенном на поддомене. */
export type SandboxState =
  /** Имени не соответствует ни один сэндбокс. */
  | { kind: 'unknown'; name: string }
  /** Сэндбокс есть, но образ ещё ни разу не публиковался. */
  | { kind: 'no_image'; name: string; repoFullName: string | null }
  /** Образ есть, сэндбокс готов к запуску. */
  | { kind: 'ready'; name: string; repoFullName: string | null }
  /** Состояние образа выяснить не удалось. Врать «образа нет» нельзя. */
  | { kind: 'indeterminate'; name: string; repoFullName: string | null }

/**
 * Вытаскивает имя сэндбокса из запрошенного хоста.
 *
 * Годится только поддомен третьего уровня непосредственно под апексом:
 * всё остальное — не адрес сэндбокса.
 */
export function sandboxNameFromHost(host: string, apexHost: string): string | undefined {
  // Порт в Host мешает сравнению и в адресе сэндбокса роли не играет.
  const hostname = (host.split(':')[0] ?? '').toLowerCase()
  const apex = apexHost.split(':')[0]?.toLowerCase()
  if (!hostname || !apex || hostname === apex) return undefined

  const suffix = `.${apex}`
  if (!hostname.endsWith(suffix)) return undefined

  const label = hostname.slice(0, -suffix.length)
  if (!label || label.includes('.')) return undefined

  return label
}

/** Имя, не проходящее формат сэндбокса, заведомо не может быть в реестре. */
export function couldBeSandbox(name: string): boolean {
  return isValidSandboxName(name)
}
