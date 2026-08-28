import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)

/** Контейнеры сэндбоксов помечаются, чтобы отличать их от всего остального. */
export const SANDBOX_LABEL = 'zerotomvp.sandbox'

const PROXY_CONTAINER = 'kamal-proxy'
const PROXY_TLS = '/home/kamal-proxy/.config/kamal-proxy/tls-zerotomvp'
const SEP = '	'

export type SandboxLimits = {
  memoryMb: number
  cpus: number
  network: string
}

export type SandboxContainer = {
  /** Имя сэндбокса, взятое из метки. */
  sandbox: string
  container: string
  image: string
  running: boolean
}

export function containerName(sandbox: string): string {
  return `zerotomvp-sandbox-${sandbox}`
}

/**
 * Имя сервиса в прокси совпадает с именем сэндбокса. Отдельный префикс не
 * нужен: имена сэндбоксов и так начинаются с `sandbox-`, поэтому спутать их
 * с сервисами платформы невозможно.
 */
function proxyService(sandbox: string): string {
  return sandbox
}

async function docker(args: string[], timeoutMs = 120_000): Promise<string> {
  const { stdout } = await run('docker', args, { timeout: timeoutMs, maxBuffer: 4 << 20 })
  return stdout.trim()
}

export async function listSandboxContainers(): Promise<SandboxContainer[]> {
  const format = [
    `{{.Label "${SANDBOX_LABEL}"}}`,
    '{{.Names}}',
    '{{.Image}}',
    '{{.State}}',
  ].join(SEP)

  const out = await docker([
    'ps',
    '--all',
    '--filter',
    `label=${SANDBOX_LABEL}`,
    '--format',
    format,
  ])
  if (!out) return []

  return out.split('\n').map((line) => {
    const [sandbox = '', container = '', image = '', state = ''] = line.split(SEP)
    return { sandbox, container, image, running: state === 'running' }
  })
}

export async function login(registry: string, user: string, password: string): Promise<void> {
  await run('docker', ['login', registry, '-u', user, '--password-stdin'], {
    timeout: 30_000,
    // Пароль уходит через стандартный ввод: в списке процессов ему не место.
    input: password,
  } as Parameters<typeof run>[2])
}

export async function pull(imageRef: string): Promise<void> {
  await docker(['pull', '--quiet', imageRef], 300_000)
}

/**
 * Запускает сэндбокс. Ограничения и снятые привилегии — не настройка, а
 * условие запуска: внутри выполняется чужой код.
 */
export async function startSandbox(
  sandbox: string,
  imageRef: string,
  limits: SandboxLimits,
): Promise<void> {
  await removeContainer(sandbox)

  await docker([
    'run',
    '--detach',
    '--name',
    containerName(sandbox),
    '--label',
    `${SANDBOX_LABEL}=${sandbox}`,
    '--network',
    limits.network,
    '--restart',
    'no',
    '--memory',
    `${limits.memoryMb}m`,
    // Без этого контейнер уходит в своп вместо честного падения по памяти.
    '--memory-swap',
    `${limits.memoryMb}m`,
    '--cpus',
    String(limits.cpus),
    '--pids-limit',
    '128',
    '--security-opt',
    'no-new-privileges',
    '--cap-drop',
    'ALL',
    '--log-opt',
    'max-size=2m',
    '--log-opt',
    'max-file=1',
    '--env',
    'PORT=3000',
    '--env',
    'NODE_ENV=production',
    imageRef,
  ])
}

export async function removeContainer(sandbox: string): Promise<void> {
  await docker(['rm', '--force', containerName(sandbox)]).catch(() => '')
}

/**
 * Ставит маршрут на сэндбокс. С этого момента его адрес ведёт в сам сэндбокс,
 * а не на страницу состояния: точное совпадение хоста выигрывает у перехватчика.
 */
export async function routeSandbox(sandbox: string, host: string): Promise<void> {
  await docker(
    [
      'exec',
      PROXY_CONTAINER,
      'kamal-proxy',
      'deploy',
      proxyService(sandbox),
      '--host',
      host,
      '--target',
      `${containerName(sandbox)}:3000`,
      '--tls',
      '--tls-certificate-path',
      `${PROXY_TLS}/cert.pem`,
      '--tls-private-key-path',
      `${PROXY_TLS}/key.pem`,
      '--health-check-path',
      '/healthz',
      '--deploy-timeout',
      '40s',
      '--drain-timeout',
      '5s',
    ],
    90_000,
  )
}

export async function unrouteSandbox(sandbox: string): Promise<void> {
  await docker(['exec', PROXY_CONTAINER, 'kamal-proxy', 'remove', proxyService(sandbox)]).catch(
    () => '',
  )
}

/** Какие сэндбоксы сейчас имеют собственный маршрут в прокси. */
export async function routedSandboxes(): Promise<Set<string>> {
  const out = await docker(['exec', PROXY_CONTAINER, 'kamal-proxy', 'list']).catch(() => '')
  const names = new Set<string>()

  for (const raw of out.split('\n')) {
    // В выводе есть управляющие последовательности оформления — снимаем их.
    const line = raw.replace(/\[[0-9;]*m/g, '')
    const match = /^\s*(sandbox-[a-z0-9-]+)\s/.exec(line)
    if (match?.[1]) names.add(match[1])
  }

  return names
}
