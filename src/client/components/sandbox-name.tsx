import { useEffect, useRef, useState } from 'react'

/**
 * Подмножество словарей платформы — ровно для иллюстрации. Совпадать с
 * серверными списками не обязано: здесь оно ничего не решает.
 */
const ADJECTIVES = [
  'brave', 'calm', 'clever', 'golden', 'lunar', 'misty', 'nimble', 'quiet',
  'rapid', 'rustic', 'silent', 'solar', 'swift', 'velvet', 'wild', 'amber',
]
const NOUNS = [
  'otter', 'heron', 'canyon', 'ember', 'falcon', 'glacier', 'harbor', 'juniper',
  'lagoon', 'meadow', 'orbit', 'raven', 'summit', 'thistle', 'willow', 'zephyr',
]

const GLYPHS = 'abcdefghijklmnopqrstuvwxyz'
const SETTLE_STEP_MS = 34
const HOLD_MS = 4200

function pick(items: readonly string[]): string {
  return items[Math.floor(Math.random() * items.length)] as string
}

function nextTarget(previous: string): string {
  let candidate = `${pick(ADJECTIVES)}-${pick(NOUNS)}`
  while (candidate === previous) candidate = `${pick(ADJECTIVES)}-${pick(NOUNS)}`
  return candidate
}

function scrambleTail(target: string, locked: number): string {
  let out = target.slice(0, locked)
  for (let i = locked; i < target.length; i += 1) {
    out += target[i] === '-' ? '-' : GLYPHS[Math.floor(Math.random() * GLYPHS.length)]
  }
  return out
}

/**
 * Имя сэндбокса выдаёт платформа, а не пользователь. Показываем это буквально:
 * имя «выпадает», буква за буквой вставая на место.
 */
export function SandboxName() {
  const [middle, setMiddle] = useState(() => nextTarget(''))
  const reduced = useRef(false)

  useEffect(() => {
    reduced.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced.current) return

    let stopped = false
    let timer: ReturnType<typeof setTimeout>
    let current = middle

    const deal = () => {
      const target = nextTarget(current)
      let locked = 0

      const step = () => {
        if (stopped) return
        if (locked > target.length) {
          current = target
          timer = setTimeout(deal, HOLD_MS)
          return
        }
        setMiddle(scrambleTail(target, locked))
        locked += 1
        timer = setTimeout(step, SETTLE_STEP_MS)
      }

      step()
    }

    timer = setTimeout(deal, HOLD_MS)
    return () => {
      stopped = true
      clearTimeout(timer)
    }
    // Запускаем один раз: дальше цикл живёт сам.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Имя и домен на разных строках: имена бывают длинными, а переносить
  // адрес по слогам нельзя — он перестаёт читаться как адрес.
  return (
    <span
      role="img"
      aria-label="Пример адреса сэндбокса: sandbox-имя.zerotomvp.xyz"
      className="block font-mono leading-none font-400"
    >
      <span className="block overflow-x-auto pb-1 text-[clamp(0.82rem,2.4vw,1.18rem)] whitespace-nowrap">
        <span className="text-muted-foreground">sandbox-</span>
        <span className="text-accent">{middle}</span>
      </span>
      <span className="text-faint-foreground mt-2 block text-[0.78rem] whitespace-nowrap">
        .zerotomvp.xyz
      </span>
    </span>
  )
}
