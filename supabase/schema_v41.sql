-- Storichi Marketplace schema v41
-- Expo device tokens for the official Android/iOS wrapper only.
-- Run after schema_v40.sql.

create table if not exists public.mobile_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  expo_push_token text not null,
  platform text not null default 'android' check (platform in ('android', 'ios')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, expo_push_token)
);

create index if not exists mobile_push_tokens_user_idx
  on public.mobile_push_tokens(user_id, updated_at desc);

alter table public.mobile_push_tokens enable row level security;

drop policy if exists "Pengguna mengelola token perangkat sendiri" on public.mobile_push_tokens;
create policy "Pengguna mengelola token perangkat sendiri" on public.mobile_push_tokens
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
