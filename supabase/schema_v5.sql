-- ============================================================
-- STORICHI MARKETPLACE — Schema v5
-- Kategori dinamis, dikelola Owner (gambar, tambah, hapus)
-- ============================================================

create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  label text not null,
  image_url text,
  sort_order integer not null default 0,
  created_at timestamptz default now()
);

alter table categories enable row level security;

drop policy if exists "Kategori bisa dilihat siapa saja" on categories;
create policy "Kategori bisa dilihat siapa saja" on categories
  for select using (true);

drop policy if exists "Owner bisa kelola kategori" on categories;
create policy "Owner bisa kelola kategori" on categories
  for all using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.is_owner = true)
  )
  with check (
    exists (select 1 from profiles p where p.id = auth.uid() and p.is_owner = true)
  );

-- Isi awal dari 6 kategori yang sudah ada (pakai emoji sementara, Owner bisa ganti gambarnya)
insert into categories (slug, label, image_url, sort_order) values
  ('top-up', 'Top Up', null, 1),
  ('game-key', 'Game Key', null, 2),
  ('akun', 'Akun', null, 3),
  ('voucher', 'Voucher', null, 4),
  ('joki', 'Joki', null, 5),
  ('item', 'Item', null, 6)
on conflict (slug) do nothing;

-- Bucket untuk gambar kategori
insert into storage.buckets (id, name, public)
values ('category-images', 'category-images', true)
on conflict (id) do nothing;

drop policy if exists "Siapa saja bisa lihat gambar kategori" on storage.objects;
create policy "Siapa saja bisa lihat gambar kategori"
  on storage.objects for select
  using (bucket_id = 'category-images');

drop policy if exists "Owner bisa upload gambar kategori" on storage.objects;
create policy "Owner bisa upload gambar kategori"
  on storage.objects for insert
  with check (
    bucket_id = 'category-images'
    and exists (select 1 from profiles p where p.id = auth.uid() and p.is_owner = true)
  );

drop policy if exists "Owner bisa hapus gambar kategori" on storage.objects;
create policy "Owner bisa hapus gambar kategori"
  on storage.objects for delete
  using (
    bucket_id = 'category-images'
    and exists (select 1 from profiles p where p.id = auth.uid() and p.is_owner = true)
  );
