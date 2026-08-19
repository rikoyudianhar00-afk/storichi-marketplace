-- ============================================================
-- STORICHI MARKETPLACE — Supabase schema
-- Jalankan file ini di Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- 1. PROFILES (dibuat otomatis saat user login pertama kali via app)
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  avatar_url text,
  email text,
  created_at timestamptz default now()
);

alter table profiles enable row level security;

create policy "Profil bisa dilihat siapa saja" on profiles
  for select using (true);

create policy "User hanya bisa update profil sendiri" on profiles
  for update using (auth.uid() = id);

create policy "User bisa insert profil sendiri" on profiles
  for insert with check (auth.uid() = id);


-- 2. PRODUCTS (katalog top up / akun / voucher dsb)
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  category text not null,
  image_url text,
  price_from numeric,
  seller_id uuid references profiles(id),
  created_at timestamptz default now()
);

alter table products enable row level security;

create policy "Produk bisa dilihat siapa saja" on products
  for select using (true);

create policy "Seller bisa insert produk sendiri" on products
  for insert with check (auth.uid() = seller_id);

create policy "Seller bisa update produk sendiri" on products
  for update using (auth.uid() = seller_id);


-- 3. CHAT THREADS (percakapan 1-on-1 antar user, misal soal produk)
create table if not exists chat_threads (
  id uuid primary key default gen_random_uuid(),
  user_a uuid references profiles(id) not null,
  user_b uuid references profiles(id) not null,
  product_id uuid references products(id),
  created_at timestamptz default now(),
  unique (user_a, user_b, product_id)
);

alter table chat_threads enable row level security;

create policy "User bisa lihat thread miliknya" on chat_threads
  for select using (auth.uid() = user_a or auth.uid() = user_b);

create policy "User bisa bikin thread" on chat_threads
  for insert with check (auth.uid() = user_a or auth.uid() = user_b);


create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid references chat_threads(id) on delete cascade not null,
  sender_id uuid references profiles(id) not null,
  content text not null,
  created_at timestamptz default now()
);

alter table chat_messages enable row level security;

create policy "User bisa baca pesan di thread miliknya" on chat_messages
  for select using (
    exists (
      select 1 from chat_threads t
      where t.id = thread_id and (t.user_a = auth.uid() or t.user_b = auth.uid())
    )
  );

create policy "User bisa kirim pesan di thread miliknya" on chat_messages
  for insert with check (
    auth.uid() = sender_id and
    exists (
      select 1 from chat_threads t
      where t.id = thread_id and (t.user_a = auth.uid() or t.user_b = auth.uid())
    )
  );


-- 4. REKBER GROUPS (grup sementara untuk middleman transaction)
create table if not exists rekber_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text unique not null,          -- kode undangan pendek, misal "RB-8X4K"
  created_by uuid references profiles(id) not null,
  status text not null default 'active', -- active | completed | cancelled
  expires_at timestamptz not null default (now() + interval '48 hours'),
  created_at timestamptz default now()
);

alter table rekber_groups enable row level security;

create policy "Creator bisa update status grup" on rekber_groups
  for update using (auth.uid() = created_by);

create policy "User bisa bikin grup rekber" on rekber_groups
  for insert with check (auth.uid() = created_by);


create table if not exists rekber_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references rekber_groups(id) on delete cascade not null,
  user_id uuid references profiles(id) not null,
  role text not null default 'member', -- creator | member
  joined_at timestamptz default now(),
  unique (group_id, user_id)
);

alter table rekber_members enable row level security;

create policy "Member bisa lihat daftar member grupnya" on rekber_members
  for select using (
    exists (
      select 1 from rekber_members m2
      where m2.group_id = group_id and m2.user_id = auth.uid()
    )
  );

create policy "User bisa join grup (insert diri sendiri)" on rekber_members
  for insert with check (auth.uid() = user_id);


-- Policy select untuk rekber_groups, dibuat setelah rekber_members ada
create policy "Member bisa lihat grup miliknya" on rekber_groups
  for select using (
    exists (
      select 1 from rekber_members m
      where m.group_id = id and m.user_id = auth.uid()
    )
  );


create table if not exists rekber_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references rekber_groups(id) on delete cascade not null,
  sender_id uuid references profiles(id) not null,
  content text not null,
  created_at timestamptz default now()
);

alter table rekber_messages enable row level security;

create policy "Member bisa baca pesan grupnya" on rekber_messages
  for select using (
    exists (
      select 1 from rekber_members m
      where m.group_id = group_id and m.user_id = auth.uid()
    )
  );

create policy "Member bisa kirim pesan di grupnya" on rekber_messages
  for insert with check (
    auth.uid() = sender_id and
    exists (
      select 1 from rekber_members m
      where m.group_id = group_id and m.user_id = auth.uid()
    )
  );

-- Aktifkan Realtime untuk chat & rekber (jalankan sekali)
alter publication supabase_realtime add table chat_messages;
alter publication supabase_realtime add table rekber_messages;
alter publication supabase_realtime add table rekber_members;
