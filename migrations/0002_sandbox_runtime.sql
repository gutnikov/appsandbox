-- Желаемое и фактическое состояние сэндбокса.
--
-- Желаемое пишет платформа, фактическое — процесс сведения. Разделение
-- намеренное: приложение, смотрящее в интернет, не управляет контейнерами,
-- оно только выражает намерение.
alter table sandboxes
  -- Желаемое: чего мы хотим от сэндбокса.
  add column desired_state text not null default 'stopped',
  -- Образ, из которого следует запускать. Заполняется уведомлением реестра.
  -- Пусто у сэндбоксов, созданных до появления уведомлений: тогда версия
  -- определяется по тегу latest в момент запуска.
  add column desired_image_digest text,
  -- Момент последнего обращения к адресу. По нему вытесняем при нехватке мест.
  add column last_requested_at timestamptz,

  -- Фактическое: что происходит на самом деле. Пишет только процесс сведения.
  add column run_status text not null default 'stopped',
  add column running_image_digest text,
  add column started_at timestamptz,
  -- Короткая причина, почему не удалось поднять. Пользователю не показывается.
  add column run_error text,

  add constraint sandboxes_desired_state_check
    check (desired_state in ('stopped', 'running')),
  add constraint sandboxes_run_status_check
    check (run_status in ('stopped', 'starting', 'running', 'failed'));

-- Процесс сведения ищет расхождения желаемого и фактического.
create index sandboxes_reconcile_idx on sandboxes (desired_state, run_status)
  where status = 'created';

-- Вытеснение выбирает самое давнее обращение среди запущенных.
create index sandboxes_eviction_idx on sandboxes (last_requested_at)
  where run_status in ('starting', 'running');
