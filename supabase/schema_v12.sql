-- Storichi Marketplace schema v12
-- Image-based game tags are independent from product categories.

create table if not exists public.game_tags (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid references public.profiles(id) on delete cascade not null,
  name text not null check (char_length(trim(name)) between 1 and 48),
  image_url text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (seller_id, name)
);

create table if not exists public.product_game_tags (
  product_id uuid references public.products(id) on delete cascade not null,
  tag_id uuid references public.game_tags(id) on delete cascade not null,
  created_at timestamptz not null default now(),
  primary key (product_id, tag_id)
);

create index if not exists game_tags_seller_idx on public.game_tags(seller_id, created_at desc);
create index if not exists product_game_tags_tag_idx on public.product_game_tags(tag_id);

alter table public.game_tags enable row level security;
alter table public.product_game_tags enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'game_tags' and policyname = 'Game tags public select') then
    create policy "Game tags public select" on public.game_tags for select using (is_active = true or auth.uid() = seller_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'game_tags' and policyname = 'Seller inserts own game tags') then
    create policy "Seller inserts own game tags" on public.game_tags for insert with check (auth.uid() = seller_id and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_owner = true));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'game_tags' and policyname = 'Seller updates own game tags') then
    create policy "Seller updates own game tags" on public.game_tags for update using (auth.uid() = seller_id and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_owner = true)) with check (auth.uid() = seller_id and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_owner = true));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'game_tags' and policyname = 'Seller deletes own game tags') then
    create policy "Seller deletes own game tags" on public.game_tags for delete using (auth.uid() = seller_id and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_owner = true));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'product_game_tags' and policyname = 'Product game tags public select') then
    create policy "Product game tags public select" on public.product_game_tags for select using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'product_game_tags' and policyname = 'Seller manages own product game tags') then
    create policy "Seller manages own product game tags" on public.product_game_tags
      for all using (
        exists (select 1 from public.products p where p.id = product_id and p.seller_id = auth.uid())
      ) with check (
        exists (select 1 from public.products p where p.id = product_id and p.seller_id = auth.uid())
        and exists (select 1 from public.game_tags g where g.id = tag_id and g.is_active = true and exists (select 1 from public.profiles owner_profile where owner_profile.id = g.seller_id and owner_profile.is_owner = true))
      );
  end if;
end $$;

insert into storage.buckets (id, name, public)
values ('game-tag-images', 'game-tag-images', true)
on conflict (id) do nothing;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Public read game tag images') then
    create policy "Public read game tag images" on storage.objects for select using (bucket_id = 'game-tag-images');
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Users upload own game tag images') then
    create policy "Users upload own game tag images" on storage.objects for insert to authenticated with check (bucket_id = 'game-tag-images' and (storage.foldername(name))[1] = auth.uid()::text and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_owner = true));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Users update own game tag images') then
    create policy "Users update own game tag images" on storage.objects for update to authenticated using (bucket_id = 'game-tag-images' and (storage.foldername(name))[1] = auth.uid()::text and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_owner = true)) with check (bucket_id = 'game-tag-images' and (storage.foldername(name))[1] = auth.uid()::text and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_owner = true));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Users delete own game tag images') then
    create policy "Users delete own game tag images" on storage.objects for delete to authenticated using (bucket_id = 'game-tag-images' and (storage.foldername(name))[1] = auth.uid()::text and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_owner = true));
  end if;
end $$;
