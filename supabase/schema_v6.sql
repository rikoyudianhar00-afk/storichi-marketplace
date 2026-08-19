-- STORICHI MARKETPLACE — Schema v6
-- Grup kategori, ranking produk, likes, views, dan notifikasi chat
-- Jalankan setelah schema_v5.sql
-- ============================================================

-- 1. GROUP KATEGORI / PINTU LUAR
create table if not exists category_groups (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  label text not null,
  image_url text,
  sort_order integer not null default 0,
  created_at timestamptz default now()
);

alter table category_groups enable row level security;

drop policy if exists "Grup kategori bisa dilihat siapa saja" on category_groups;
create policy "Grup kategori bisa dilihat siapa saja" on category_groups
  for select using (true);

drop policy if exists "Owner bisa kelola grup kategori" on category_groups;
create policy "Owner bisa kelola grup kategori" on category_groups
  for all using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.is_owner = true)
  )
  with check (
    exists (select 1 from profiles p where p.id = auth.uid() and p.is_owner = true)
  );

alter table categories
  add column if not exists group_id uuid references category_groups(id) on delete set null;

create index if not exists categories_group_id_idx on categories(group_id);

-- 2. METRIK PRODUK UNTUK TRENDING / TOP SALES
alter table products add column if not exists view_count integer not null default 0;
alter table products add column if not exists like_count integer not null default 0;
alter table products add column if not exists sales_count integer not null default 0;

create index if not exists products_category_idx on products(category);
create index if not exists products_ranking_idx on products(sales_count desc, like_count desc, view_count desc);

create table if not exists product_likes (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id) on delete cascade not null,
  user_id uuid references profiles(id) on delete cascade not null,
  created_at timestamptz default now(),
  unique(product_id, user_id)
);

alter table product_likes enable row level security;

drop policy if exists "User bisa melihat like miliknya" on product_likes;
create policy "User bisa melihat like miliknya" on product_likes
  for select using (auth.uid() = user_id);

drop policy if exists "User bisa memberi like sendiri" on product_likes;
create policy "User bisa memberi like sendiri" on product_likes
  for insert with check (auth.uid() = user_id);

drop policy if exists "User bisa menghapus like sendiri" on product_likes;
create policy "User bisa menghapus like sendiri" on product_likes
  for delete using (auth.uid() = user_id);

create or replace function refresh_product_like_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update products set like_count = like_count + 1 where id = new.product_id;
    return new;
  end if;

  update products set like_count = greatest(like_count - 1, 0) where id = old.product_id;
  return old;
end;
$$;

drop trigger if exists product_like_count_trigger on product_likes;
create trigger product_like_count_trigger
after insert or delete on product_likes
for each row execute function refresh_product_like_count();

create or replace function increment_product_view(product_uuid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update products set view_count = view_count + 1 where id = product_uuid;
end;
$$;

grant execute on function increment_product_view(uuid) to anon, authenticated;

-- 3. PENANDA NOTIFIKASI PESAN MASUK
create table if not exists chat_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid references profiles(id) on delete cascade not null,
  thread_id uuid references chat_threads(id) on delete cascade not null,
  message_id uuid references chat_messages(id) on delete cascade not null,
  read_at timestamptz,
  created_at timestamptz default now()
);

alter table chat_notifications enable row level security;

drop policy if exists "User bisa melihat notifikasinya" on chat_notifications;
create policy "User bisa melihat notifikasinya" on chat_notifications
  for select using (auth.uid() = recipient_id);

drop policy if exists "User bisa menandai notifikasinya" on chat_notifications;
create policy "User bisa menandai notifikasinya" on chat_notifications
  for update using (auth.uid() = recipient_id)
  with check (auth.uid() = recipient_id);

create or replace function create_chat_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recipient uuid;
begin
  select case when user_a = new.sender_id then user_b else user_a end
    into recipient
    from chat_threads
    where id = new.thread_id;

  if recipient is not null then
    insert into chat_notifications (recipient_id, thread_id, message_id)
    values (recipient, new.thread_id, new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists chat_notification_trigger on chat_messages;
create trigger chat_notification_trigger
after insert on chat_messages
for each row execute function create_chat_notification();

alter publication supabase_realtime add table chat_notifications;
