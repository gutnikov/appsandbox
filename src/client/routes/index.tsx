import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: Landing,
})

function Landing() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-6 px-6">
      <h1 className="text-4xl font-semibold tracking-tight">zerotomvp</h1>
      <p className="text-muted-foreground">
        Каркас платформы. Лендинг собирается в задаче 8.1.
      </p>
    </main>
  )
}
