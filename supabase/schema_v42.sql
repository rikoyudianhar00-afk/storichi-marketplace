-- Storichi Marketplace schema v42
-- A reviewer may rate one Midman (MM) only once across all Rekber transactions.

create table if not exists public.rekber_third_party_rating_locks (
  reviewer_id uuid references public.profiles(id) on delete cascade not null,
  third_party_id uuid references public.profiles(id) on delete cascade not null,
  first_group_id uuid references public.rekber_groups(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (reviewer_id, third_party_id)
);

-- Preserve historical rows; they establish the lock without deleting user history.
insert into public.rekber_third_party_rating_locks (reviewer_id, third_party_id, first_group_id, created_at)
select distinct on (reviewer_id, third_party_id)
  reviewer_id,
  third_party_id,
  group_id,
  created_at
from public.rekber_third_party_reviews
order by reviewer_id, third_party_id, created_at asc, id asc
on conflict (reviewer_id, third_party_id) do nothing;

alter table public.rekber_third_party_rating_locks enable row level security;

drop policy if exists "Peserta dapat memberi rating pihak ketiga" on public.rekber_third_party_reviews;

create or replace function public.submit_rekber_buyer_rating(
  p_group_id uuid,
  p_product_rating integer,
  p_third_party_rating integer,
  p_comment text default null
)
returns void
language plpgsql security definer set search_path = public
as $$
declare current_group public.rekber_groups%rowtype; request_row public.purchase_requests%rowtype;
begin
  if p_product_rating not between 1 and 5 or p_third_party_rating not between 1 and 5 then raise exception 'Rating harus antara 1 sampai 5'; end if;
  select * into current_group from public.rekber_groups where id = p_group_id and status = 'active';
  if current_group.id is null or current_group.buyer_id is distinct from auth.uid() then raise exception 'Hanya Buyer pada transaksi ini yang dapat memberi rating'; end if;
  if current_group.midman_rating_requested_at is null then raise exception 'Midman (MM) belum meminta rating'; end if;
  insert into public.rekber_third_party_rating_locks(reviewer_id, third_party_id, first_group_id)
  values (auth.uid(), current_group.third_party_id, current_group.id)
  on conflict (reviewer_id, third_party_id) do nothing;
  if not found then raise exception 'Anda sudah pernah memberi rating untuk Midman (MM) ini'; end if;
  select * into request_row from public.purchase_requests where id = current_group.purchase_request_id;
  insert into public.product_reviews(product_id, purchase_request_id, buyer_id, seller_id, rating, comment)
  values (request_row.product_id, request_row.id, request_row.buyer_id, request_row.seller_id, p_product_rating, nullif(trim(coalesce(p_comment, '')), ''))
  on conflict (purchase_request_id) do nothing;
  insert into public.rekber_third_party_reviews(group_id, purchase_request_id, reviewer_id, third_party_id, rating, comment)
  values (current_group.id, request_row.id, auth.uid(), current_group.third_party_id, p_third_party_rating, nullif(trim(coalesce(p_comment, '')), ''))
  on conflict (group_id, reviewer_id) do nothing;
  update public.purchase_requests set buyer_rating = coalesce(buyer_rating, p_product_rating), buyer_rating_comment = coalesce(buyer_rating_comment, nullif(trim(coalesce(p_comment, '')), '')) where id = request_row.id;
end;
$$;
grant execute on function public.submit_rekber_buyer_rating(uuid, integer, integer, text) to authenticated;

create or replace function public.submit_rekber_seller_rating(
  p_group_id uuid,
  p_third_party_rating integer,
  p_comment text default null
)
returns void
language plpgsql security definer set search_path = public
as $$
declare current_group public.rekber_groups%rowtype; request_row public.purchase_requests%rowtype;
begin
  if p_third_party_rating not between 1 and 5 then raise exception 'Rating harus antara 1 sampai 5'; end if;
  select * into current_group from public.rekber_groups where id = p_group_id and status = 'active';
  if current_group.id is null or current_group.seller_id is distinct from auth.uid() then raise exception 'Hanya Seller pada transaksi ini yang dapat memberi rating'; end if;
  if current_group.midman_rating_requested_at is null then raise exception 'Midman (MM) belum meminta rating'; end if;
  insert into public.rekber_third_party_rating_locks(reviewer_id, third_party_id, first_group_id)
  values (auth.uid(), current_group.third_party_id, current_group.id)
  on conflict (reviewer_id, third_party_id) do nothing;
  if not found then raise exception 'Anda sudah pernah memberi rating untuk Midman (MM) ini'; end if;
  select * into request_row from public.purchase_requests where id = current_group.purchase_request_id;
  insert into public.rekber_third_party_reviews(group_id, purchase_request_id, reviewer_id, third_party_id, rating, comment)
  values (current_group.id, request_row.id, auth.uid(), current_group.third_party_id, p_third_party_rating, nullif(trim(coalesce(p_comment, '')), ''))
  on conflict (group_id, reviewer_id) do nothing;
end;
$$;
grant execute on function public.submit_rekber_seller_rating(uuid, integer, text) to authenticated;

create or replace function public.complete_rekber_custody(
  p_group_id uuid,
  p_final_price numeric default null,
  p_item_quantity integer default null
)
returns public.rekber_groups
language plpgsql security definer set search_path = public
as $$
declare current_group public.rekber_groups%rowtype; updated_group public.rekber_groups; request_row public.purchase_requests%rowtype;
available_stock integer; quantity integer; product_unit_price numeric; final_transaction_price numeric; rating_count integer;
begin
  select * into current_group from public.rekber_groups where id = p_group_id and status = 'active' for update;
  if current_group.id is null or current_group.third_party_id is distinct from auth.uid() then raise exception 'Hanya Midman (MM) yang dapat menyelesaikan custody'; end if;
  if current_group.activated_at is null or current_group.buyer_done_at is null or current_group.seller_done_at is null then raise exception 'Seller dan Buyer harus menyelesaikan konfirmasi terlebih dahulu'; end if;
  if current_group.qris_to_third_party_sent_at is null then raise exception 'QRIS Seller belum dikirim kepada Midman (MM)'; end if;
  if current_group.midman_rating_requested_at is null then raise exception 'Midman (MM) harus meminta rating terlebih dahulu'; end if;
  select count(*) into rating_count
  from unnest(array[current_group.buyer_id, current_group.seller_id]) as participant_id
  where exists (select 1 from public.rekber_third_party_rating_locks lock where lock.reviewer_id = participant_id and lock.third_party_id = current_group.third_party_id);
  if rating_count < 2 then raise exception 'Menunggu rating Seller dan Buyer sebelum custody diselesaikan'; end if;
  select * into request_row from public.purchase_requests where id = current_group.purchase_request_id for update;
  if p_item_quantity is not null and p_item_quantity < 1 then raise exception 'Jumlah barang harus minimal 1'; end if;
  quantity := greatest(coalesce(p_item_quantity, request_row.item_quantity, 1), 1);
  if p_final_price is not null and p_final_price <= 0 then raise exception 'Harga transaksi harus lebih besar dari nol'; end if;
  select stock, price_from into available_stock, product_unit_price from public.products where id = request_row.product_id for update;
  if coalesce(available_stock, 0) < quantity then raise exception 'Stok produk tidak mencukupi'; end if;
  final_transaction_price := coalesce(p_final_price, request_row.final_price, product_unit_price * quantity);
  if final_transaction_price is null or final_transaction_price <= 0 then raise exception 'Harga transaksi belum tersedia'; end if;
  update public.rekber_groups set status = 'completed', workflow_status = 'released', custody_completed_at = now(), released_at = now() where id = p_group_id;
  update public.purchase_requests set status = 'completed', final_price = final_transaction_price, item_quantity = quantity, completed_at = now(), seller_done_at = coalesce(seller_done_at, now()) where id = request_row.id;
  update public.products set sales_count = coalesce(sales_count, 0) + quantity, stock = greatest(coalesce(available_stock, 0) - quantity, 0), is_active = case when coalesce(available_stock, 0) <= quantity then false else is_active end, sold_out_at = case when coalesce(available_stock, 0) <= quantity then now() else sold_out_at end where id = request_row.product_id;
  select * into updated_group from public.rekber_groups where id = p_group_id;
  return updated_group;
end;
$$;
grant execute on function public.complete_rekber_custody(uuid, numeric, integer) to authenticated;

notify pgrst, 'reload schema';
