-- Storichi Marketplace schema v14
-- Direct purchase flow without Rekber, item rating, final seller price, and chat attachment size.

alter table public.purchase_requests add column if not exists purchase_mode text not null default 'pending';
alter table public.purchase_requests add column if not exists final_price numeric;
alter table public.purchase_requests add column if not exists buyer_rating integer;
alter table public.purchase_requests add column if not exists buyer_rating_comment text;
alter table public.purchase_requests add column if not exists rating_requested_at timestamptz;
alter table public.purchase_requests add column if not exists seller_done_at timestamptz;
alter table public.purchase_requests add column if not exists completed_at timestamptz;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'purchase_requests_buyer_rating_check') then
    alter table public.purchase_requests add constraint purchase_requests_buyer_rating_check check (buyer_rating is null or buyer_rating between 1 and 5);
  end if;
end $$;

alter table public.chat_messages add column if not exists attachment_size_bytes integer;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'chat_messages_attachment_size_check') then
    alter table public.chat_messages add constraint chat_messages_attachment_size_check check (attachment_size_bytes is null or attachment_size_bytes <= 102400);
  end if;
end $$;

create table if not exists public.product_reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id) on delete cascade not null,
  purchase_request_id uuid references public.purchase_requests(id) on delete cascade not null unique,
  buyer_id uuid references public.profiles(id) on delete cascade not null,
  seller_id uuid references public.profiles(id) on delete cascade not null,
  rating integer not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now()
);

create index if not exists product_reviews_product_idx on public.product_reviews(product_id, created_at desc);
alter table public.product_reviews enable row level security;

drop policy if exists "Product reviews public select" on public.product_reviews;
create policy "Product reviews public select" on public.product_reviews for select using (true);
drop policy if exists "Buyer inserts product review" on public.product_reviews;
create policy "Buyer inserts product review" on public.product_reviews for insert with check (auth.uid() = buyer_id);

create or replace function public.choose_direct_purchase(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare req purchase_requests%rowtype;
begin
  select * into req from purchase_requests where id = p_request_id;
  if req.id is null or req.status <> 'approved' then raise exception 'Permintaan belum disetujui'; end if;
  if auth.uid() is distinct from req.buyer_id and auth.uid() is distinct from req.seller_id then raise exception 'Tidak berwenang'; end if;
  update purchase_requests set purchase_mode = 'direct' where id = p_request_id;
end;
$$;

grant execute on function public.choose_direct_purchase(uuid) to authenticated;

create or replace function public.request_direct_rating(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare req purchase_requests%rowtype;
begin
  select * into req from purchase_requests where id = p_request_id;
  if req.id is null or req.status <> 'approved' or req.purchase_mode <> 'direct' then raise exception 'Pembelian langsung belum aktif'; end if;
  if auth.uid() is distinct from req.seller_id then raise exception 'Hanya penjual yang dapat meminta rating'; end if;
  if req.buyer_rating is not null then raise exception 'Rating sudah diberikan'; end if;
  update purchase_requests set rating_requested_at = now() where id = p_request_id;
end;
$$;

grant execute on function public.request_direct_rating(uuid) to authenticated;

create or replace function public.submit_direct_rating(p_request_id uuid, p_rating integer, p_comment text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare req purchase_requests%rowtype;
begin
  if p_rating < 1 or p_rating > 5 then raise exception 'Rating harus antara 1 sampai 5'; end if;
  select * into req from purchase_requests where id = p_request_id;
  if req.id is null or req.status <> 'approved' or req.purchase_mode <> 'direct' then raise exception 'Pembelian langsung belum aktif'; end if;
  if auth.uid() is distinct from req.buyer_id then raise exception 'Hanya pembeli yang dapat memberi rating'; end if;
  if req.rating_requested_at is null then raise exception 'Penjual belum meminta rating'; end if;
  if req.buyer_rating is not null then raise exception 'Rating sudah diberikan'; end if;
  insert into product_reviews(product_id, purchase_request_id, buyer_id, seller_id, rating, comment)
  values (req.product_id, req.id, req.buyer_id, req.seller_id, p_rating, nullif(trim(coalesce(p_comment, '')), ''));
  update purchase_requests set buyer_rating = p_rating, buyer_rating_comment = nullif(trim(coalesce(p_comment, '')), ''), rating_requested_at = null where id = p_request_id;
end;
$$;

grant execute on function public.submit_direct_rating(uuid, integer, text) to authenticated;

create or replace function public.complete_direct_purchase(p_request_id uuid, p_final_price numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare req purchase_requests%rowtype;
begin
  if p_final_price is null or p_final_price <= 0 then raise exception 'Harga final harus lebih besar dari nol'; end if;
  select * into req from purchase_requests where id = p_request_id;
  if req.id is null or req.status <> 'approved' or req.purchase_mode <> 'direct' then raise exception 'Pembelian langsung belum aktif'; end if;
  if auth.uid() is distinct from req.seller_id then raise exception 'Hanya penjual yang dapat menekan DONE'; end if;
  if req.buyer_rating is null then raise exception 'Pembeli harus memberi rating terlebih dahulu'; end if;
  update purchase_requests set status = 'completed', final_price = p_final_price, seller_done_at = now(), completed_at = now() where id = p_request_id;
  update products set sales_count = coalesce(sales_count, 0) + 1 where id = req.product_id;
end;
$$;

grant execute on function public.complete_direct_purchase(uuid, numeric) to authenticated;

alter publication supabase_realtime add table product_reviews;
