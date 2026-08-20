-- Storichi Marketplace schema v19
-- Personalized Discover signals and separate seller-store rating flow.
-- Jalankan setelah schema_v18.sql.

create table if not exists public.user_search_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  query text not null check (char_length(trim(query)) between 1 and 120),
  created_at timestamptz not null default now()
);

create index if not exists user_search_events_user_created_idx
  on public.user_search_events(user_id, created_at desc);

alter table public.user_search_events enable row level security;

drop policy if exists "Users can insert own search events" on public.user_search_events;
create policy "Users can insert own search events" on public.user_search_events
  for insert with check (auth.uid() = user_id);

drop policy if exists "Users can read own search events" on public.user_search_events;
create policy "Users can read own search events" on public.user_search_events
  for select using (auth.uid() = user_id);

-- Store ratings are intentionally separate from product_reviews.
-- One buyer can rate the same store once per completed purchase request.
create or replace function public.submit_store_review(
  p_seller_id uuid,
  p_purchase_request_id uuid,
  p_rating integer,
  p_comment text default null
)
returns public.seller_reviews
language plpgsql
security definer
set search_path = public
as $$
declare
  req public.purchase_requests%rowtype;
  review_row public.seller_reviews;
begin
  if p_rating < 1 or p_rating > 5 then
    raise exception 'Rating toko harus antara 1 sampai 5';
  end if;
  if auth.uid() is null then
    raise exception 'Silakan masuk terlebih dahulu';
  end if;
  select * into req
  from public.purchase_requests
  where id = p_purchase_request_id;
  if req.id is null or req.status <> 'completed' then
    raise exception 'Rating toko hanya tersedia setelah transaksi selesai';
  end if;
  if req.buyer_id is distinct from auth.uid() or req.seller_id is distinct from p_seller_id then
    raise exception 'Kamu hanya dapat menilai toko dari transaksi milikmu sendiri';
  end if;
  if exists (select 1 from public.seller_reviews where purchase_request_id = p_purchase_request_id) then
    raise exception 'Transaksi ini sudah memiliki rating toko';
  end if;

  insert into public.seller_reviews(seller_id, reviewer_id, purchase_request_id, rating, comment)
  values (p_seller_id, auth.uid(), p_purchase_request_id, p_rating, nullif(trim(coalesce(p_comment, '')), ''))
  returning * into review_row;
  return review_row;
end;
$$;

grant execute on function public.submit_store_review(uuid, uuid, integer, text) to authenticated;

alter publication supabase_realtime add table public.user_search_events;

-- Direct-purchase rating is product-only. Store rating is submitted separately from ShopPage.
create or replace function public.submit_direct_rating(p_request_id uuid, p_rating integer, p_comment text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare req public.purchase_requests%rowtype;
begin
  if p_rating < 1 or p_rating > 5 then
    raise exception 'Rating produk harus antara 1 sampai 5';
  end if;
  select * into req from public.purchase_requests where id = p_request_id;
  if req.id is null or req.status <> 'approved' or req.purchase_mode <> 'direct' then
    raise exception 'Pembelian langsung belum aktif';
  end if;
  if auth.uid() is distinct from req.buyer_id then
    raise exception 'Hanya pembeli yang dapat memberi rating produk';
  end if;
  if req.rating_requested_at is null then
    raise exception 'Penjual belum meminta rating produk';
  end if;
  if req.buyer_rating is not null then
    raise exception 'Rating produk sudah diberikan';
  end if;

  insert into public.product_reviews(product_id, purchase_request_id, buyer_id, seller_id, rating, comment)
  values (req.product_id, req.id, req.buyer_id, req.seller_id, p_rating, nullif(trim(coalesce(p_comment, '')), ''));

  update public.purchase_requests
  set buyer_rating = p_rating,
      buyer_rating_comment = nullif(trim(coalesce(p_comment, '')), ''),
      rating_requested_at = null
  where id = p_request_id;
end;
$$;

grant execute on function public.submit_direct_rating(uuid, integer, text) to authenticated;
