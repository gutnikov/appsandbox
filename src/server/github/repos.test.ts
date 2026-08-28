import { describe, expect, it } from 'vitest'
import { GitHubApiError, RepositoryNameTakenError, createFromTemplate } from './repos.ts'

const PARAMS = {
  templateRepo: 'gutnikov/sandbox-template',
  owner: 'someone',
  name: 'sandbox-brave-otter',
}

function respond(status: number, body: unknown): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch
}

describe('createFromTemplate', () => {
  it('порождает публичный репозиторий в аккаунте пользователя', async () => {
    const calls: { url: string; init: RequestInit }[] = []
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url, init })
      return new Response(
        JSON.stringify({
          full_name: 'someone/sandbox-brave-otter',
          html_url: 'https://github.com/someone/sandbox-brave-otter',
        }),
        { status: 201, headers: { 'content-type': 'application/json' } },
      )
    }) as unknown as typeof fetch

    const repo = await createFromTemplate('t0ken', PARAMS, fetchImpl)

    expect(repo).toEqual({
      fullName: 'someone/sandbox-brave-otter',
      url: 'https://github.com/someone/sandbox-brave-otter',
    })

    const call = calls[0]
    expect(call?.url).toBe('https://api.github.com/repos/gutnikov/sandbox-template/generate')
    const body = JSON.parse(String(call?.init.body))
    expect(body).toMatchObject({ owner: 'someone', name: 'sandbox-brave-otter', private: false })
  })

  it('отличает занятое имя от прочих ошибок — его устраняет повтор', async () => {
    const fetchImpl = respond(422, {
      message: 'Repository creation failed.',
      errors: [{ field: 'name', message: 'name already exists on this account' }],
    })

    await expect(createFromTemplate('t0ken', PARAMS, fetchImpl)).rejects.toBeInstanceOf(
      RepositoryNameTakenError,
    )
  })

  it('прочие 422 не считает конфликтом имени', async () => {
    const fetchImpl = respond(422, { message: 'Repository creation failed.', errors: [] })

    await expect(createFromTemplate('t0ken', PARAMS, fetchImpl)).rejects.toBeInstanceOf(
      GitHubApiError,
    )
  })

  it('сообщает об ошибке сервера GitHub', async () => {
    await expect(createFromTemplate('t0ken', PARAMS, respond(503, {}))).rejects.toMatchObject({
      name: 'GitHubApiError',
      status: 503,
    })
  })
})
