-- STORICHI MARKETPLACE — Schema v8
-- Subscription Web Push untuk notifikasi saat web ditutup
-- Jalankan setelah schema_v7.sql
-- ============================================================

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  endpoint text not null,
  subscription jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

alter table push_subscriptions enable row level security;

drop policy if exists "User bisa melihat push subscription sendiri" on push_subscriptions;
create policy "User bisa melihat push subscription sendiri" on push_subscriptions
  for select using (auth.uid() = user_id);

drop policy if exists "User bisa menyimpan push subscription sendiri" on push_subscriptions;
create policy "User bisa menyimpan push subscription sendiri" on push_subscriptions
  for insert with check (auth.uid() = user_id);

drop policy if exists "User bisa memperbarui push subscription sendiri" on push_subscriptions;
create policy "User bisa memperbarui push subscription sendiri" on push_subscriptions
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "User bisa menghapus push subscription sendiri" on push_subscriptions;
create policy "User bisa menghapus push subscription sendiri" on push_subscriptions
  for delete using (auth.uid() = user_id);

create index if not exists push_subscriptions_user_id_idx on push_subscriptions(user_id);
