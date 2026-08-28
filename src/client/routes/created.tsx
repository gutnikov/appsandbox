import { createFileRoute } from '@tanstack/react-router'
import { Footer, Label, Ticks } from '@/components/frame.tsx'
import { ButtonLink } from '@/components/ui/button.tsx'
import { useSandboxHost } from '@/lib/config.ts'

type CreatedSearch = {
  name: string
  repo?: string
}

export const Route = createFileRoute('/created')({
  validateSearch: (search: Record<string, unknown>): CreatedSearch => ({
    name: typeof search.name === 'string' ? search.name : '',
    repo: typeof search.repo === 'string' ? search.repo : undefined,
  }),
  component: Created,
})

function Row({
  label,
  children,
  note,
}: {
  label: string
  children: React.ReactNode
  note?: string
}) {
  return (
    <div className="border-border grid gap-2 border-t py-5 sm:grid-cols-[9rem_1fr] sm:gap-6">
      <Label className="pt-1">{label}</Label>
      <div className="min-w-0">
        {children}
        {note && <p className="text-faint-foreground mt-1.5 text-[0.78rem]">{note}</p>}
      </div>
    </div>
  )
}

function Created() {
  const { name, repo } = Route.useSearch()
  const sandboxHost = useSandboxHost()

  if (!name) {
    return (
      <main className="flex flex-1 flex-col justify-center py-16">
        <Label className="text-accent">нет данных</Label>
        <h1 className="font-display mt-3 text-4xl font-300">Сэндбокс не указан.</h1>
        <a href="/" className="label text-muted-foreground hover:text-accent mt-6 w-fit">
          ← создать сэндбокс
        </a>
      </main>
    )
  }

  const repoUrl = repo ? `https://github.com/${repo}` : undefined
  const sandboxUrl = `https://${name}.${sandboxHost}`

  return (
    <main className="flex flex-1 flex-col justify-center gap-12 py-14 sm:py-20">
      <div>
        <Label className="reveal text-accent">сэндбокс создан</Label>
        <h1
          className="reveal font-mono mt-5 text-[clamp(1.3rem,5vw,2.4rem)] leading-none font-400 tracking-tight break-all"
          style={{ animationDelay: '60ms' }}
        >
          {name}
        </h1>
      </div>

      <div
        className="reveal bg-surface/60 relative rounded-xs px-6 py-1 backdrop-blur-sm sm:px-8"
        style={{ animationDelay: '140ms' }}
      >
        <Ticks />

        <Row label="репозиторий" note="Публичный, в вашем аккаунте. Полностью ваш.">
          {repoUrl ? (
            <a
              href={repoUrl}
              className="text-accent hover:text-foreground font-mono text-[0.85rem] break-all underline decoration-dotted underline-offset-4 transition-colors"
            >
              {repo}
            </a>
          ) : (
            <span className="text-muted-foreground font-mono text-[0.85rem]">—</span>
          )}
        </Row>

        <Row
          label="адрес"
          note="Закреплён за вами. Начнёт отвечать, когда платформа запустит сэндбокс."
        >
          <span className="text-muted-foreground font-mono text-[0.85rem] break-all">
            {sandboxUrl}
          </span>
        </Row>
      </div>

      <div className="reveal" style={{ animationDelay: '220ms' }}>
        <div className="rule" />
        <p className="text-muted-foreground mt-6 max-w-lg text-[0.9rem] leading-relaxed">
          Клонируйте репозиторий, правьте код и делайте push — дальше сборка запускается сама.
          Что менять можно, а что платформа ожидает неизменным, написано в{' '}
          <span className="text-foreground">README</span>.
        </p>

        <div className="mt-7 flex flex-wrap gap-4">
          {repoUrl && <ButtonLink href={repoUrl}>Открыть репозиторий →</ButtonLink>}
          <ButtonLink href="/" variant="outline">
            Ещё один сэндбокс
          </ButtonLink>
        </div>
      </div>

      <Footer />
    </main>
  )
}
