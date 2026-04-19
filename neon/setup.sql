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
  story text not null,
  memory_date date not null default current_date,
  image_url text
);

create index if not exists idx_todo_created_at on todo (created_at desc);
create index if not exists idx_memories_memory_date on memories (memory_date desc);
