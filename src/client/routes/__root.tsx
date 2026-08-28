import type { QueryClient } from '@tanstack/react-query'
import { Outlet, createRootRouteWithContext } from '@tanstack/react-router'
import { Page } from '@/components/frame.tsx'

export type RouterContext = {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: () => (
    <Page>
      <Outlet />
    </Page>
  ),
  notFoundComponent: () => (
    <main className="flex flex-1 flex-col justify-center py-16">
      <p className="label text-accent">404</p>
      <h1 className="font-display mt-3 text-4xl font-300">Такой страницы нет.</h1>
      <a href="/" className="label text-muted-foreground hover:text-accent mt-6 w-fit">
        ← на главную
      </a>
    </main>
  ),
})
