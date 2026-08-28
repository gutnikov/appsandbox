import type { ReactNode } from 'react'
import { cn } from '@/lib/utils.ts'

/** Угловые засечки — как на чертеже: обозначают границу поля, а не рамку. */
export function Ticks({ className }: { className?: string }) {
  const corner = 'absolute h-2.5 w-2.5 border-accent-dim'
  return (
    <div aria-hidden className={cn('pointer-events-none absolute inset-0', className)}>
      <span className={cn(corner, '-top-px -left-px border-t border-l')} />
      <span className={cn(corner, '-top-px -right-px border-t border-r')} />
      <span className={cn(corner, '-bottom-px -left-px border-b border-l')} />
      <span className={cn(corner, '-right-px -bottom-px border-r border-b')} />
    </div>
  )
}

export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('label text-faint-foreground', className)}>{children}</p>
}

export function Masthead() {
  return (
    <header className="flex items-baseline justify-between gap-4 border-b border-border pb-4">
      <a href="/" className="font-mono text-[0.8rem] font-500 tracking-[0.22em] uppercase">
        zerotomvp
      </a>
      <p className="label text-faint-foreground hidden sm:block">
        прототип → адрес
      </p>
    </header>
  )
}

export function Page({ children }: { children: ReactNode }) {
  return (
    <div className="grain blueprint min-h-dvh">
      {/* Тёплое свечение сверху: источник света, к которому тянется страница. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 h-[70vh]"
        style={{
          background:
            'radial-gradient(60% 55% at 50% 0%, oklch(0.795 0.156 63 / 9%), transparent 70%)',
        }}
      />
      <div className="relative mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-6 py-8 sm:px-10">
        <Masthead />
        {children}
      </div>
    </div>
  )
}

export function Footer() {
  return (
    <footer className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
      <Label>zerotomvp.xyz</Label>
      <Label>сэндбоксы публичные</Label>
    </footer>
  )
}
