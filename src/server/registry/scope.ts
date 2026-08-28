/**
 * Разбор параметра `scope` из запроса docker-клиента к realm.
 * Формат: `repository:<имя>:<действие>[,<действие>]`.
 */
export type AccessRequest = {
  type: string
  name: string
  actions: string[]
}

// delete нужен платформе для чистки старых образов; сборке он не выдаётся.
const ALLOWED_ACTIONS = new Set(['push', 'pull', 'delete'])

export function parseScopes(scopes: readonly string[]): AccessRequest[] {
  const requests: AccessRequest[] = []

  for (const scope of scopes) {
    if (!scope) continue

    // Имя репозитория может содержать двоеточия? Нет, но действия отделяются
    // последним двоеточием, поэтому режем по нему, а не по первому.
    const lastColon = scope.lastIndexOf(':')
    const firstColon = scope.indexOf(':')
    if (firstColon <= 0 || lastColon <= firstColon) continue

    const type = scope.slice(0, firstColon)
    const name = scope.slice(firstColon + 1, lastColon)
    const actions = scope
      .slice(lastColon + 1)
      .split(',')
      .map((action) => action.trim())
      .filter((action) => ALLOWED_ACTIONS.has(action))

    if (!name || actions.length === 0) continue
    requests.push({ type, name, actions })
  }

  return requests
}

/**
 * Оставляет только то, на что у предъявителя есть право: работа с
 * единственным своим образом. Всё остальное отбрасывается молча — по
 * протоколу реестр сам вернёт отказ, увидев пустой access.
 */
const BUILD_ACTIONS = new Set(['push', 'pull'])

export function grantOnly(
  requests: readonly AccessRequest[],
  allowedRepository: string,
): AccessRequest[] {
  return requests
    .filter((request) => request.type === 'repository' && request.name === allowedRepository)
    .map((request) => ({
      type: 'repository',
      name: request.name,
      // Сборке — только публикация и чтение: удалять образы она не должна.
      actions: request.actions.filter((action) => BUILD_ACTIONS.has(action)),
    }))
    .filter((request) => request.actions.length > 0)
}
