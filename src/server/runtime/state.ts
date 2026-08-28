import type { Pool } from 'pg'

export type DesiredState = 'stopped' | 'running'
export type RunStatus = 'stopped' | 'starting' | 'running' | 'failed'

export type RuntimeRow = {
  name: string
  repo_full_name: string | null
  desired_state: DesiredState
  desired_image_digest: string | null
  last_requested_at: Date | null
  run_status: RunStatus
  running_image_digest: string | null
  started_at: Date | null
  run_error: string | null
}

const COLUMNS = `name, repo_full_name, desired_state, desired_image_digest,
  last_requested_at, run_status, running_image_digest, started_at, run_error`

export async function readRuntime(pool: Pool, name: string): Promise<RuntimeRow | undefined> {
  const { rows } = await pool.query<RuntimeRow>(
    `select ${COLUMNS} from sandboxes where name = $1 and status = 'created'`,
    [name],
  )
  return rows[0]
}

/**
 * Записывает намерение поднять сэндбокс. Повторные обращения не плодят
 * работу: они лишь двигают отметку последнего обращения, по которой
 * выбирается кандидат на вытеснение.
 *
 * Упавший запуск сбрасывается только новым обращением — иначе процесс
 * сведения крутил бы безнадёжный контейнер по кругу.
 */
export async function requestWake(pool: Pool, name: string): Promise<RuntimeRow | undefined> {
  const { rows } = await pool.query<RuntimeRow>(
    `update sandboxes
        set desired_state = 'running',
            last_requested_at = now(),
            run_status = case when run_status = 'failed' then 'stopped' else run_status end,
            run_error = case when run_status = 'failed' then null else run_error end
      where name = $1 and status = 'created'
      returning ${COLUMNS}`,
    [name],
  )
  return rows[0]
}

/** Вызывается уведомлением реестра: у сэндбокса появилась новая версия. */
export async function setDesiredImage(
  pool: Pool,
  name: string,
  digest: string,
): Promise<boolean> {
  const { rowCount } = await pool.query(
    `update sandboxes set desired_image_digest = $2
      where name = $1 and status = 'created'`,
    [name, digest],
  )
  return (rowCount ?? 0) > 0
}
