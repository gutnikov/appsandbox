import type { SandboxState } from './state.ts'

/**
 * Страница отдаётся сервером и не зависит от бандла: она должна работать в
 * том числе когда с приложением что-то не так. Поэтому стили внутри.
 */
const STYLE = `
:root{color-scheme:dark;--bg:oklch(.158 .006 62);--surface:oklch(.196 .007 62);
--fg:oklch(.947 .004 80);--muted:oklch(.638 .009 72);--faint:oklch(.46 .008 70);
--accent:oklch(.795 .156 63);--border:oklch(.285 .009 65)}
*{box-sizing:border-box;margin:0}
body{background:var(--bg);color:var(--fg);min-height:100dvh;
font-family:'Instrument Sans',ui-sans-serif,system-ui,sans-serif;
-webkit-font-smoothing:antialiased;
background-image:linear-gradient(to right,oklch(1 0 0/3.2%) 1px,transparent 1px),
linear-gradient(to bottom,oklch(1 0 0/3.2%) 1px,transparent 1px);background-size:64px 64px}
.wrap{max-width:44rem;margin:0 auto;padding:2rem 1.5rem;min-height:100dvh;
display:flex;flex-direction:column;gap:2.5rem}
header{display:flex;justify-content:space-between;align-items:baseline;
border-bottom:1px solid var(--border);padding-bottom:1rem}
.mono{font-family:'Martian Mono',ui-monospace,SFMono-Regular,monospace}
.label{font-family:'Martian Mono',ui-monospace,monospace;font-size:.625rem;
font-weight:500;letter-spacing:.18em;text-transform:uppercase;color:var(--faint)}
a{color:var(--accent)}
main{flex:1;display:flex;flex-direction:column;justify-content:center;gap:1.75rem}
h1{font-family:'Fraunces',Georgia,serif;font-weight:300;line-height:1.05;
font-size:clamp(2rem,6vw,3.2rem);letter-spacing:-.02em}
.addr{font-family:'Martian Mono',ui-monospace,monospace;font-size:clamp(.75rem,2.6vw,1rem);
word-break:break-all;color:var(--muted)}
.card{background:oklch(.196 .007 62/.6);padding:1.5rem;border:1px solid var(--border);
border-radius:2px}
p{line-height:1.65;color:var(--muted)}
.cta{display:inline-flex;align-items:center;gap:.6rem;height:3rem;padding:0 1.5rem;
background:var(--accent);color:oklch(.16 .02 62);text-decoration:none;border-radius:2px;
font-family:'Martian Mono',ui-monospace,monospace;font-size:.7rem;font-weight:500;
letter-spacing:.18em;text-transform:uppercase}
footer{border-top:1px solid var(--border);padding-top:1.25rem}
`

type Copy = {
  label: string
  heading: string
  body: string
  cta?: { href: string; text: string }
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  )
}

function copyFor(state: SandboxState, apexHost: string): Copy {
  const repoUrl = 'repoFullName' in state && state.repoFullName
    ? `https://github.com/${state.repoFullName}`
    : undefined

  switch (state.kind) {
    case 'unknown':
      return {
        label: 'сэндбокса нет',
        heading: 'Здесь пока пусто.',
        body: 'Такого сэндбокса не существует. Возможно, в адресе опечатка — или его ещё не создали.',
        cta: { href: `https://${apexHost}/`, text: 'Создать свой →' },
      }
    case 'no_image':
      return {
        label: 'сборки ещё не было',
        heading: 'Сэндбокс создан, но не собран.',
        body: 'Репозиторий есть, а образа ещё нет: сборка запускается при первом push в основную ветку. Загляните во вкладку Actions — там видно, идёт ли она.',
        ...(repoUrl ? { cta: { href: repoUrl, text: 'Открыть репозиторий →' } } : {}),
      }
    case 'ready':
      return {
        label: 'готов к запуску',
        heading: 'Образ собран.',
        body: 'Сэндбокс собран и ждёт запуска. Платформа пока не умеет поднимать сэндбоксы — это ближайшее, что мы делаем.',
        ...(repoUrl ? { cta: { href: repoUrl, text: 'Открыть репозиторий →' } } : {}),
      }
    case 'indeterminate':
      return {
        label: 'состояние неизвестно',
        heading: 'Не удалось выяснить состояние.',
        body: 'Сэндбокс существует, но проверить, собран ли образ, сейчас не получилось. Попробуйте обновить страницу через минуту.',
        ...(repoUrl ? { cta: { href: repoUrl, text: 'Открыть репозиторий →' } } : {}),
      }
  }
}

export function renderStatusPage(state: SandboxState, apexHost: string): string {
  const copy = copyFor(state, apexHost)
  const address = `${state.name}.${apexHost}`

  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(address)} — zerotomvp</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300..600&family=Instrument+Sans:wght@400;500&family=Martian+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>${STYLE}</style>
</head>
<body>
<div class="wrap">
  <header>
    <a class="mono" href="https://${escapeHtml(apexHost)}/" style="text-decoration:none;color:inherit;font-size:.8rem;letter-spacing:.22em;text-transform:uppercase">zerotomvp</a>
    <span class="label">сэндбокс</span>
  </header>
  <main>
    <div>
      <p class="label" style="color:var(--accent)">${escapeHtml(copy.label)}</p>
      <h1 style="margin-top:1rem">${escapeHtml(copy.heading)}</h1>
    </div>
    <div class="card">
      <p class="label">адрес</p>
      <p class="addr" style="margin-top:.75rem">${escapeHtml(address)}</p>
    </div>
    <p>${escapeHtml(copy.body)}</p>
    ${copy.cta ? `<div><a class="cta" href="${escapeHtml(copy.cta.href)}">${escapeHtml(copy.cta.text)}</a></div>` : ''}
  </main>
  <footer><span class="label">zerotomvp.xyz</span></footer>
</div>
</body>
</html>
`
}
