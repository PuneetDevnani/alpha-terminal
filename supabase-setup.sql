-- Alpha Terminal — Cloud Sync setup
-- Run this once in your Supabase project: SQL Editor → New query → paste → Run

create table if not exists public.kv_store (
  user_id    uuid not null references auth.users(id) on delete cascade,
  key        text not null,
  value      jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table public.kv_store enable row level security;

create policy "select own rows"
  on public.kv_store for select
  using (auth.uid() = user_id);

create policy "insert own rows"
  on public.kv_store for insert
  with check (auth.uid() = user_id);

create policy "update own rows"
  on public.kv_store for update
  using (auth.uid() = user_id);

create policy "delete own rows"
  on public.kv_store for delete
  using (auth.uid() = user_id);
