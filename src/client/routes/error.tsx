import { createFileRoute } from '@tanstack/react-router'
import { Footer, Label, Ticks } from '@/components/frame.tsx'
import { ButtonLink } from '@/components/ui/button.tsx'
import {
  FAILURE_MESSAGES,
  type FailureReason,
  isFailureReason,
} from '../../shared/errors.ts'

type ErrorSearch = {
  reason: FailureReason
}

export const Route = createFileRoute('/error')({
  validateSearch: (search: Record<string, unknown>): ErrorSearch => ({
    reason: isFailureReason(search.reason) ? search.reason : 'internal',
  }),
  component: Failure,
})

/** Заголовок отражает суть отказа, подробность — что делать дальше. */
const HEADINGS: Record<FailureReason, string> = {
  denied: 'Доступ не выдан.',
  state: 'Попытка не завершилась.',
  github: 'GitHub не ответил.',
  names_exhausted: 'Имя не подобралось.',
  internal: 'Что-то сломалось у нас.',
}

function Failure() {
  const { reason } = Route.useSearch()

  return (
    <main className="flex flex-1 flex-col justify-center gap-12 py-14 sm:py-20">
      <div>
        <Label className="reveal text-destructive">сэндбокс не создан</Label>
        <h1
          className="font-display reveal mt-5 text-[clamp(2.2rem,6vw,3.6rem)] leading-[1] font-300 tracking-[-0.02em]"
          style={{ animationDelay: '60ms' }}
        >
          {HEADINGS[reason]}
        </h1>
      </div>

      <div
        className="reveal bg-surface/60 relative max-w-xl rounded-xs p-6 backdrop-blur-sm sm:p-8"
        style={{ animationDelay: '140ms' }}
      >
        <Ticks />
        <Label className="text-faint-foreground">что произошло</Label>
        <p className="text-muted-foreground mt-4 text-[0.95rem] leading-relaxed">
          {FAILURE_MESSAGES[reason]}
        </p>
        {reason === 'denied' && (
          <p className="text-faint-foreground mt-4 text-[0.82rem] leading-relaxed">
            Мы просим доступ только к публичным репозиториям — он нужен, чтобы создать проект
            в вашем аккаунте. Ничего другого платформа не читает и не меняет.
          </p>
        )}
      </div>

      <div className="reveal" style={{ animationDelay: '220ms' }}>
        <div className="rule" />
        <div className="mt-7 flex flex-wrap gap-4">
          <ButtonLink href="/api/auth/github">Попробовать ещё раз →</ButtonLink>
          <ButtonLink href="/" variant="outline">
            На главную
          </ButtonLink>
        </div>
      </div>

      <Footer />
    </main>
  )
}
