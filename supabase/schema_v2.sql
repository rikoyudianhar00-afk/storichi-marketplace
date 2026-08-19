-- ============================================================
-- STORICHI MARKETPLACE — Schema tambahan (v2)
-- Jalankan SETELAH schema.sql yang lama sudah ada
-- ============================================================

-- 1. ROLE SYSTEM di profiles
alter table profiles add column if not exists role text not null default 'buyer';
-- role: 'buyer' | 'seller' | 'midman' | 'owner'
-- buyer/seller otomatis dihitung dari app, midman/owner di-assign manual oleh owner

-- Fungsi untuk cek apakah email termasuk hardcoded owner list
create or replace function is_owner_email(check_email text)
returns boolean as $$
begin
  return check_email in (
    'hoshiizenstore@gmail.com',
    'Biasa101009@gmail.com',
    'opsionalketiga@gmail.com'
  );
end;
$$ language plpgsql immutable;

-- Trigger: begitu profile dibuat/update, kalau emailnya owner, set role owner otomatis
create or replace function set_owner_role()
returns trigger as $$
begin
  if is_owner_email(new.email) then
    new.role := 'owner';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_set_owner_role on profiles;
create trigger trg_set_owner_role
  before insert or update on profiles
  for each row execute function set_owner_role();

-- Policy tambahan: owner bisa update role siapa saja
drop policy if exists "Owner bisa ubah role siapa saja" on profiles;
create policy "Owner bisa ubah role siapa saja" on profiles
  for update using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'owner')
  );


-- 2. PRODUCTS — lengkapi kolom
alter table products add column if not exists description text;
alter table products add column if not exists stock integer not null default 1;
alter table products add column if not exists images text[] default '{}';
alter table products add column if not exists is_active boolean not null default true;

create policy if not exists "Seller bisa hapus produk sendiri" on products
  for delete using (auth.uid() = seller_id);


-- 3. STORAGE bucket untuk gambar produk
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

create policy "Siapa saja bisa lihat gambar produk"
  on storage.objects for select
  using (bucket_id = 'product-images');

create policy "User login bisa upload gambar produk"
  on storage.objects for insert
  with check (bucket_id = 'product-images' and auth.role() = 'authenticated');

create policy "User bisa hapus gambar miliknya sendiri"
  on storage.objects for delete
  using (bucket_id = 'product-images' and owner = auth.uid());


-- 4. PURCHASE REQUESTS — alur "mau beli" -> approve/reject penjual
create table if not exists purchase_requests (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id) not null,
  buyer_id uuid references profiles(id) not null,
  seller_id uuid references profiles(id) not null,
  thread_id uuid references chat_threads(id),
  status text not null default 'pending', -- pending | approved | rejected
  rekber_group_id uuid references rekber_groups(id),
  created_at timestamptz default now()
);

alter table purchase_requests enable row level security;

create policy "Buyer/seller bisa lihat request miliknya" on purchase_requests
  for select using (auth.uid() = buyer_id or auth.uid() = seller_id);

create policy "Buyer bisa bikin request beli" on purchase_requests
  for insert with check (auth.uid() = buyer_id);

create policy "Seller bisa update status request" on purchase_requests
  for update using (auth.uid() = seller_id);


-- 5. SELLER REVIEWS — rating & ulasan penjual
create table if not exists seller_reviews (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid references profiles(id) not null,
  reviewer_id uuid references profiles(id) not null,
  purchase_request_id uuid references purchase_requests(id),
  rating integer not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz default now(),
  unique (purchase_request_id)
);

alter table seller_reviews enable row level security;

create policy "Semua bisa baca review" on seller_reviews
  for select using (true);

create policy "Reviewer bisa bikin review sendiri" on seller_reviews
  for insert with check (auth.uid() = reviewer_id);


-- 6. Tambah kolom invite di rekber_members (untuk fitur invite midman)
-- (rekber_members sudah ada, cukup pastikan role 'midman' bisa dipakai di kolom role yang sudah ada)

-- Aktifkan Realtime untuk purchase_requests
alter publication supabase_realtime add table purchase_requests;
