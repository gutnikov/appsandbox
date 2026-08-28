import { useQuery } from '@tanstack/react-query'

export type PublicConfig = {
  /** Апекс, на поддоменах которого живут сэндбоксы. */
  sandboxHost: string
}

/**
 * Адрес сэндбокса — это обещание пользователю, поэтому апекс берём у сервера,
 * а не угадываем. Пока ответ не пришёл, показываем текущий хост: в production
 * это то же значение, так что подмены не видно.
 */
export function useSandboxHost(): string {
  const { data } = useQuery({
    queryKey: ['config'],
    queryFn: async (): Promise<PublicConfig> => {
      const response = await fetch('/api/config')
      if (!response.ok) throw new Error('config unavailable')
      return (await response.json()) as PublicConfig
    },
    staleTime: Infinity,
  })

  return data?.sandboxHost ?? window.location.host
}
