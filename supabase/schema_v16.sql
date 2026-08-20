-- Storichi Marketplace schema v16
-- Owner-managed homepage product boxes and curated products.
-- Jalankan setelah schema_v15.sql.

create table if not exists public.home_sections (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  icon text not null default '✦',
  category_label text not null default '',
  view_all_href text not null default '',
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.home_section_products (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.home_sections(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  title_override text not null default '',
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (section_id, product_id)
);

alter table public.home_sections enable row level security;
alter table public.home_section_products enable row level security;

drop policy if exists "Homepage active sections public read" on public.home_sections;
create policy "Homepage active sections public read" on public.home_sections
  for select using (is_active = true);

drop policy if exists "Homepage owner full section access" on public.home_sections;
create policy "Homepage owner full section access" on public.home_sections
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_owner = true)
  ) with check (
    created_by = auth.uid()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_owner = true)
  );

drop policy if exists "Homepage active products public read" on public.home_section_products;
create policy "Homepage active products public read" on public.home_section_products
  for select using (
    exists (select 1 from public.home_sections s where s.id = section_id and s.is_active = true)
  );

drop policy if exists "Homepage owner full product access" on public.home_section_products;
create policy "Homepage owner full product access" on public.home_section_products
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_owner = true)
  ) with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_owner = true)
  );

create index if not exists home_sections_public_order_idx
  on public.home_sections(is_active, display_order, created_at);
create index if not exists home_section_products_order_idx
  on public.home_section_products(section_id, display_order, created_at);

-- Realtime is optional for the public page but useful for an Owner editing from another tab.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'home_sections'
  ) then
    execute 'alter publication supabase_realtime add table public.home_sections';
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'home_section_products'
  ) then
    execute 'alter publication supabase_realtime add table public.home_section_products';
  end if;
end
$$;
