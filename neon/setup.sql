create extension if not exists pgcrypto;

create table if not exists todo (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  todo text not null,
  note text,
  due_date date,
  completed boolean not null default false
);

create table if not exists memories (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  title text not null,
  story text not null default '',
  memory_date date,
  image_url text,
  image_urls text[] not null default '{}',
  source_todo_id bigint unique
);

alter table todo add column if not exists due_date date;
alter table memories alter column story set default '';
alter table memories alter column memory_date drop not null;
alter table memories add column if not exists image_urls text[] not null default '{}';
alter table memories add column if not exists source_todo_id bigint unique;

update memories
set image_urls = case
  when image_url is not null and coalesce(array_length(image_urls, 1), 0) = 0 then array[image_url]
  else image_urls
end;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'memories_source_todo_id_fkey'
  ) then
    alter table memories
      add constraint memories_source_todo_id_fkey
      foreign key (source_todo_id) references todo(id) on delete set null;
  end if;
end $$;

create index if not exists idx_todo_created_at on todo (created_at desc);
create index if not exists idx_memories_memory_date on memories (memory_date desc);
