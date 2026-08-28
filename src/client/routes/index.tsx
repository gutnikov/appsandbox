import { createFileRoute } from '@tanstack/react-router'
import { Footer, Label, Ticks } from '@/components/frame.tsx'
import { SandboxName } from '@/components/sandbox-name.tsx'
import { ButtonLink } from '@/components/ui/button.tsx'

export const Route = createFileRoute('/')({ component: Landing })

const STEPS = [
  { n: '01', title: 'Вход', body: 'Через GitHub. Просим доступ только к публичным репозиториям.' },
  { n: '02', title: 'Репозиторий', body: 'В вашем аккаунте появляется проект из нашего шаблона.' },
  { n: '03', title: 'Адрес', body: 'За сэндбоксом закрепляется поддомен zerotomvp.xyz.' },
]

function Landing() {
  return (
    <main className="flex flex-1 flex-col justify-center gap-14 py-14 sm:py-20">
      <div className="grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-end lg:gap-16">
        <div>
          <Label className="reveal" >00 / зачем</Label>

          <h1
            className="font-display reveal mt-5 text-[clamp(2.6rem,7vw,4.6rem)] leading-[0.95] font-300 tracking-[-0.02em]"
            style={{ animationDelay: '60ms' }}
          >
            Идея становится
            <br />
            <span className="text-accent italic">работающим</span> приложением.
          </h1>

          <p
            className="reveal text-muted-foreground mt-7 max-w-md text-[0.98rem] leading-relaxed"
            style={{ animationDelay: '140ms' }}
          >
            Одно нажатие. В вашем GitHub появляется репозиторий, а у прототипа —
            собственный адрес. Дальше вы просто пишете код и делаете push.
          </p>
        </div>

        {/* Табло с адресом: имя выдаёт платформа, и это видно сразу. */}
        <div
          className="reveal bg-surface/70 glow-accent relative rounded-xs p-6 backdrop-blur-sm sm:p-8"
          style={{ animationDelay: '220ms' }}
        >
          <Ticks />
          <div className="flex items-center justify-between gap-4">
            <Label className="text-accent-dim">ваш будущий адрес</Label>
            <span
              aria-hidden
              className="bg-accent h-1.5 w-1.5 rounded-full"
              style={{ animation: 'pulse-dot 2.4s ease-in-out infinite' }}
            />
          </div>
          <div className="mt-6">
            <SandboxName />
          </div>
          <p className="text-faint-foreground mt-6 text-[0.8rem] leading-relaxed">
            Имя придумывать не нужно — платформа выдаёт его сама и сразу закрепляет за вами.
          </p>
        </div>
      </div>

      <div
        className="reveal flex flex-wrap items-center gap-x-7 gap-y-4"
        style={{ animationDelay: '300ms' }}
      >
        <ButtonLink href="/api/auth/github">
          Создать сэндбокс
          <span aria-hidden className="transition-transform duration-200 group-hover:translate-x-1">
            →
          </span>
        </ButtonLink>
        <p className="text-faint-foreground max-w-xs text-[0.78rem] leading-relaxed">
          Нужен аккаунт GitHub. Будет создан <span className="text-muted-foreground">публичный</span>{' '}
          репозиторий в вашем аккаунте.
        </p>
      </div>

      <div className="reveal" style={{ animationDelay: '380ms' }}>
        <div className="rule" />
        <ol className="mt-6 grid gap-7 sm:grid-cols-3">
          {STEPS.map((step) => (
            <li key={step.n}>
              <div className="flex items-baseline gap-3">
                <span className="label text-accent-dim">{step.n}</span>
                <h2 className="font-mono text-[0.72rem] font-500 tracking-[0.14em] uppercase">
                  {step.title}
                </h2>
              </div>
              <p className="text-muted-foreground mt-2.5 text-[0.85rem] leading-relaxed">
                {step.body}
              </p>
            </li>
          ))}
        </ol>
      </div>

      <Footer />
    </main>
  )
}
