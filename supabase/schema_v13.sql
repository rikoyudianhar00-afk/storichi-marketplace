-- Storichi Marketplace schema v13
-- Enforce Owner-only game tag creation and image uploads.

alter table public.game_tags enable row level security;
alter table public.product_game_tags enable row level security;

drop policy if exists "Seller inserts own game tags" on public.game_tags;
drop policy if exists "Seller updates own game tags" on public.game_tags;
drop policy if exists "Seller deletes own game tags" on public.game_tags;

create policy "Seller inserts own game tags" on public.game_tags
  for insert with check (
    auth.uid() = seller_id
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_owner = true)
  );

create policy "Seller updates own game tags" on public.game_tags
  for update using (
    auth.uid() = seller_id
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_owner = true)
  ) with check (
    auth.uid() = seller_id
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_owner = true)
  );

create policy "Seller deletes own game tags" on public.game_tags
  for delete using (
    auth.uid() = seller_id
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_owner = true)
  );

drop policy if exists "Seller manages own product game tags" on public.product_game_tags;
create policy "Seller manages own product game tags" on public.product_game_tags
  for all using (
    exists (select 1 from public.products p where p.id = product_id and p.seller_id = auth.uid())
  ) with check (
    exists (select 1 from public.products p where p.id = product_id and p.seller_id = auth.uid())
    and exists (
      select 1 from public.game_tags g
      join public.profiles owner_profile on owner_profile.id = g.seller_id
      where g.id = tag_id and g.is_active = true and owner_profile.is_owner = true
    )
  );

drop policy if exists "Users upload own game tag images" on storage.objects;
drop policy if exists "Users update own game tag images" on storage.objects;
drop policy if exists "Users delete own game tag images" on storage.objects;

create policy "Users upload own game tag images" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'game-tag-images'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_owner = true)
  );

create policy "Users update own game tag images" on storage.objects
  for update to authenticated using (
    bucket_id = 'game-tag-images'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_owner = true)
  ) with check (
    bucket_id = 'game-tag-images'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_owner = true)
  );

create policy "Users delete own game tag images" on storage.objects
  for delete to authenticated using (
    bucket_id = 'game-tag-images'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_owner = true)
  );
