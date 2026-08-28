import type { Fetch } from './oauth.ts'

const API_ROOT = 'https://api.github.com'

export class GitHubApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'GitHubApiError'
    this.status = status
  }
}

/** Имя занято в аккаунте пользователя — устраняется повтором с другим именем. */
export class RepositoryNameTakenError extends Error {
  readonly repoName: string

  constructor(repoName: string) {
    super(`Репозиторий ${repoName} уже существует в аккаунте`)
    this.name = 'RepositoryNameTakenError'
    this.repoName = repoName
  }
}

export type CreatedRepo = {
  fullName: string
  url: string
}

export type CreateFromTemplateParams = {
  /** Шаблон в виде owner/repo. */
  templateRepo: string
  /** Владелец нового репозитория — всегда сам пользователь. */
  owner: string
  name: string
}

type ErrorBody = {
  message?: string
  errors?: { field?: string; message?: string }[]
}

function isNameTaken(body: ErrorBody): boolean {
  return (body.errors ?? []).some(
    (error) => error.field === 'name' && /already exists/i.test(error.message ?? ''),
  )
}

/**
 * Порождает репозиторий из шаблона в личном аккаунте пользователя.
 * Репозиторий публичный: приватный потребовал бы скоупа `repo`.
 */
export async function createFromTemplate(
  token: string,
  params: CreateFromTemplateParams,
  fetchImpl: Fetch = fetch,
): Promise<CreatedRepo> {
  const response = await fetchImpl(`${API_ROOT}/repos/${params.templateRepo}/generate`, {
    method: 'POST',
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'user-agent': 'zerotomvp',
      'x-github-api-version': '2022-11-28',
    },
    body: JSON.stringify({
      owner: params.owner,
      name: params.name,
      private: false,
      include_all_branches: false,
    }),
  })

  if (response.status === 201) {
    const body = (await response.json()) as { full_name?: string; html_url?: string }
    if (!body.full_name || !body.html_url) {
      throw new GitHubApiError(201, 'GitHub не вернул данные созданного репозитория')
    }
    return { fullName: body.full_name, url: body.html_url }
  }

  if (response.status === 422) {
    const body = (await response.json().catch(() => ({}))) as ErrorBody
    if (isNameTaken(body)) throw new RepositoryNameTakenError(params.name)
    throw new GitHubApiError(422, body.message ?? 'GitHub отклонил создание репозитория')
  }

  throw new GitHubApiError(response.status, `GitHub ответил ${response.status} на создание репозитория`)
}
