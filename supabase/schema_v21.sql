-- Storichi Marketplace schema v21
-- Unique buyer product views and safe product view counting.
-- Jalankan setelah schema_v20.sql.

create table if not exists public.product_views (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  viewer_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (product_id, viewer_id)
);

create index if not exists product_views_product_idx
  on public.product_views(product_id, created_at desc);
create index if not exists product_views_viewer_idx
  on public.product_views(viewer_id, created_at desc);

alter table public.product_views enable row level security;
drop policy if exists "Users can read own product views" on public.product_views;
create policy "Users can read own product views" on public.product_views
  for select using (auth.uid() = viewer_id);
drop policy if exists "Users can record own product views" on public.product_views;
create policy "Users can record own product views" on public.product_views
  for insert with check (auth.uid() = viewer_id);

create or replace function public.record_product_view(product_uuid uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer;
  seller_uuid uuid;
begin
  if auth.uid() is null then
    return false;
  end if;

  select seller_id into seller_uuid
  from public.products
  where id = product_uuid and is_active = true;

  if seller_uuid is null or seller_uuid = auth.uid() then
    return false;
  end if;

  insert into public.product_views(product_id, viewer_id)
  values (product_uuid, auth.uid())
  on conflict (product_id, viewer_id) do nothing;

  get diagnostics inserted_count = row_count;
  if inserted_count = 1 then
    update public.products
    set view_count = coalesce(view_count, 0) + 1
    where id = product_uuid;
    return true;
  end if;

  return false;
end;
$$;

grant execute on function public.record_product_view(uuid) to authenticated;
