-- Storichi Marketplace schema v20
-- Wishlist, notification center, and seller/product activity notifications.
-- Jalankan setelah schema_v19.sql.

create table if not exists public.product_wishlists (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (product_id, user_id)
);

create index if not exists product_wishlists_user_created_idx
  on public.product_wishlists(user_id, created_at desc);
create index if not exists product_wishlists_product_idx
  on public.product_wishlists(product_id, created_at desc);

alter table public.product_wishlists enable row level security;
drop policy if exists "Users can read own wishlists" on public.product_wishlists;
create policy "Users can read own wishlists" on public.product_wishlists
  for select using (auth.uid() = user_id);
drop policy if exists "Users can add own wishlist" on public.product_wishlists;
create policy "Users can add own wishlist" on public.product_wishlists
  for insert with check (auth.uid() = user_id);
drop policy if exists "Users can remove own wishlist" on public.product_wishlists;
create policy "Users can remove own wishlist" on public.product_wishlists
  for delete using (auth.uid() = user_id);

create table if not exists public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  type text not null,
  title text not null,
  body text not null,
  href text,
  entity_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists user_notifications_recipient_idx
  on public.user_notifications(recipient_id, created_at desc);
create index if not exists user_notifications_unread_idx
  on public.user_notifications(recipient_id, read_at, created_at desc);

alter table public.user_notifications enable row level security;
drop policy if exists "Users can read own notifications" on public.user_notifications;
create policy "Users can read own notifications" on public.user_notifications
  for select using (auth.uid() = recipient_id);
drop policy if exists "Users can mark own notifications read" on public.user_notifications;
create policy "Users can mark own notifications read" on public.user_notifications
  for update using (auth.uid() = recipient_id) with check (auth.uid() = recipient_id);

create or replace function public.notify_product_wishlist()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  product_row public.products%rowtype;
  actor_name text;
begin
  select * into product_row from public.products where id = new.product_id;
  if product_row.id is null or product_row.seller_id is null or product_row.seller_id = new.user_id then
    return new;
  end if;
  select display_name into actor_name from public.profiles where id = new.user_id;
  insert into public.user_notifications(recipient_id, actor_id, type, title, body, href, entity_id)
  values (
    product_row.seller_id,
    new.user_id,
    'wishlist_added',
    'Wishlist bertambah',
    coalesce(actor_name, 'Seseorang') || ' menambahkan produk "' || product_row.name || '" ke wishlist.',
    '/produk/' || product_row.slug,
    product_row.id
  );
  return new;
end;
$$;

drop trigger if exists product_wishlist_notification_trigger on public.product_wishlists;
create trigger product_wishlist_notification_trigger
after insert on public.product_wishlists
for each row execute function public.notify_product_wishlist();

create or replace function public.notify_product_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  product_row public.products%rowtype;
  actor_name text;
begin
  select * into product_row from public.products where id = new.product_id;
  select display_name into actor_name from public.profiles where id = new.buyer_id;
  if product_row.seller_id is not null and product_row.seller_id <> new.buyer_id then
    insert into public.user_notifications(recipient_id, actor_id, type, title, body, href, entity_id)
    values (
      product_row.seller_id,
      new.buyer_id,
      'product_review_received',
      'Penilaian produk masuk',
      coalesce(actor_name, 'Pembeli') || ' memberi ' || new.rating || '/5 untuk produk "' || product_row.name || '".',
      '/produk/' || product_row.slug,
      new.id
    );
  end if;
  return new;
end;
$$;

drop trigger if exists product_review_notification_trigger on public.product_reviews;
create trigger product_review_notification_trigger
after insert on public.product_reviews
for each row execute function public.notify_product_review();

create or replace function public.notify_store_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  seller_name text;
  actor_name text;
  target_request uuid;
begin
  select display_name into seller_name from public.profiles where id = new.seller_id;
  select display_name into actor_name from public.profiles where id = new.reviewer_id;
  target_request := new.purchase_request_id;
  insert into public.user_notifications(recipient_id, actor_id, type, title, body, href, entity_id)
  values (
    new.seller_id,
    new.reviewer_id,
    'store_review_received',
    'Penilaian toko masuk',
    coalesce(actor_name, 'Pembeli') || ' memberi ' || new.rating || '/5 untuk toko ' || coalesce(seller_name, 'kamu') || '.',
    '/toko/' || new.seller_id,
    coalesce(target_request, new.id)
  );
  return new;
end;
$$;

drop trigger if exists store_review_notification_trigger on public.seller_reviews;
create trigger store_review_notification_trigger
after insert on public.seller_reviews
for each row execute function public.notify_store_review();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'user_notifications'
  ) then
    execute 'alter publication supabase_realtime add table public.user_notifications';
  end if;
end
$$;
