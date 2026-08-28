-- Реестр имён сэндбоксов.
--
-- Имя сэндбокса — это одновременно название репозитория пользователя и
-- поддомен третьего уровня, то есть глобальный ресурс. Арбитром уникальности
-- должна быть база, а не проверка в коде: только уникальный индекс корректно
-- разрешает гонку двух одновременных запросов.
create table sandboxes (
  id             bigint generated always as identity primary key,
  name           text        not null,
  status         text        not null default 'reserved',
  github_login   text        not null,
  repo_full_name text,
  repo_url       text,
  created_at     timestamptz not null default now(),
  provisioned_at timestamptz,

  constraint sandboxes_status_check
    check (status in ('reserved', 'created')),

  -- Обязательный префикс делает невозможным захват служебных поддоменов
  -- платформы (www, api, app). Ограничение длины — из требований к метке DNS.
  constraint sandboxes_name_format_check
    check (name ~ '^sandbox-[a-z0-9]+(-[a-z0-9]+)*$' and length(name) <= 63),

  -- Созданный сэндбокс обязан ссылаться на существующий репозиторий.
  constraint sandboxes_created_has_repo_check
    check (
      status <> 'created'
      or (repo_full_name is not null and repo_url is not null and provisioned_at is not null)
    )
);

create unique index sandboxes_name_key on sandboxes (name);

create index sandboxes_github_login_idx on sandboxes (github_login);

-- Для будущей чистки резервов, которые не дошли до создания репозитория.
create index sandboxes_reserved_idx on sandboxes (created_at) where status = 'reserved';
