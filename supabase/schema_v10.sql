-- STORICHI MARKETPLACE — Schema v10
-- Menu navigasi Owner-editable
-- Jalankan setelah schema_v9.sql

create table if not exists navigation_links (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  href text not null,
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_by uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table navigation_links enable row level security;
drop policy if exists "Menu aktif dapat dilihat publik" on navigation_links;
create policy "Menu aktif dapat dilihat publik" on navigation_links for select using (is_active = true);
drop policy if exists "Owner dapat melihat semua menu" on navigation_links;
create policy "Owner dapat melihat semua menu" on navigation_links for select using (exists (select 1 from profiles p where p.id = auth.uid() and p.is_owner = true));
drop policy if exists "Owner dapat membuat menu" on navigation_links;
create policy "Owner dapat membuat menu" on navigation_links for insert with check (auth.uid() = created_by and exists (select 1 from profiles p where p.id = auth.uid() and p.is_owner = true));
drop policy if exists "Owner dapat memperbarui menu" on navigation_links;
create policy "Owner dapat memperbarui menu" on navigation_links for update using (exists (select 1 from profiles p where p.id = auth.uid() and p.is_owner = true));
drop policy if exists "Owner dapat menghapus menu" on navigation_links;
create policy "Owner dapat menghapus menu" on navigation_links for delete using (exists (select 1 from profiles p where p.id = auth.uid() and p.is_owner = true));

create index if not exists navigation_links_active_order_idx on navigation_links(is_active, display_order, created_at);
