-- Опубликованные образы сэндбокса.
--
-- Реестр не хранит момент публикации, поэтому «оставить последние N» по его
-- данным не выразить. Записываем сами, когда приходит уведомление.
create table sandbox_images (
  sandbox_name text        not null references sandboxes (name) on delete cascade,
  digest       text        not null,
  pushed_at    timestamptz not null default now(),

  primary key (sandbox_name, digest)
);

create index sandbox_images_recent_idx on sandbox_images (sandbox_name, pushed_at desc);
