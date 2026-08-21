-- Storichi Marketplace schema v36
-- Midman requests Seller/Buyer ratings before custody completion.
-- Run after schema_v35.sql.

alter table public.rekber_groups
  add column if not exists midman_rating_requested_at timestamptz;

create or replace function public.request_rekber_rating(p_group_id uuid)
returns public.rekber_groups
language plpgsql
security definer
set search_path = public
as $$
declare current_group public.rekber_groups%rowtype; updated_group public.rekber_groups;
begin
  select * into current_group
  from public.rekber_groups
  where id = p_group_id and status = 'active'
  for update;
  if current_group.id is null or current_group.third_party_id is distinct from auth.uid() then
    raise exception 'Hanya Midman (MM) yang dapat meminta rating';
  end if;
  if current_group.activated_at is null or current_group.custody_requested_at is null then
    raise exception 'Pengamanan dana/item belum diminta';
  end if;
  if current_group.buyer_done_at is null or current_group.seller_done_at is null then
    raise exception 'Seller dan Buyer harus menyetujui penyelesaian terlebih dahulu';
  end if;
  update public.rekber_groups
  set midman_rating_requested_at = coalesce(midman_rating_requested_at, now())
  where id = p_group_id
  returning * into updated_group;
  return updated_group;
end;
$$;
grant execute on function public.request_rekber_rating(uuid) to authenticated;

drop function if exists public.complete_rekber_custody(uuid);
create or replace function public.complete_rekber_custody(p_group_id uuid)
returns public.rekber_groups
language plpgsql
security definer
set search_path = public
as $$
declare
  current_group public.rekber_groups%rowtype;
  updated_group public.rekber_groups;
  request_row public.purchase_requests%rowtype;
  available_stock integer;
  quantity integer;
  rating_count integer;
begin
  select * into current_group from public.rekber_groups where id = p_group_id and status = 'active' for update;
  if current_group.id is null or current_group.third_party_id is distinct from auth.uid() then raise exception 'Hanya Midman (MM) yang dapat menyelesaikan custody'; end if;
  if current_group.activated_at is null or current_group.buyer_done_at is null or current_group.seller_done_at is null then raise exception 'Seller dan Buyer harus menyelesaikan konfirmasi terlebih dahulu'; end if;
  if current_group.qris_to_third_party_sent_at is null then raise exception 'QRIS Seller belum dikirim kepada Midman (MM)'; end if;
  if current_group.midman_rating_requested_at is null then raise exception 'Midman (MM) harus meminta rating terlebih dahulu'; end if;
  select count(*) into rating_count from public.rekber_third_party_reviews where group_id = p_group_id and reviewer_id in (current_group.buyer_id, current_group.seller_id);
  if rating_count < 2 then raise exception 'Menunggu rating Seller dan Buyer sebelum custody diselesaikan'; end if;
  select * into request_row from public.purchase_requests where id = current_group.purchase_request_id for update;
  quantity := greatest(coalesce(request_row.item_quantity, 1), 1);
  select stock into available_stock from public.products where id = request_row.product_id for update;
  if coalesce(available_stock, 0) < quantity then raise exception 'Stok produk tidak mencukupi'; end if;
  update public.rekber_groups set status = 'completed', workflow_status = 'released', custody_completed_at = now(), released_at = now() where id = p_group_id;
  update public.purchase_requests set status = 'completed', completed_at = now(), seller_done_at = coalesce(seller_done_at, now()) where id = request_row.id;
  update public.products set sales_count = coalesce(sales_count, 0) + quantity, stock = greatest(coalesce(available_stock, 0) - quantity, 0), is_active = case when coalesce(available_stock, 0) <= quantity then false else is_active end, sold_out_at = case when coalesce(available_stock, 0) <= quantity then now() else sold_out_at end where id = request_row.product_id;
  select * into updated_group from public.rekber_groups where id = p_group_id;
  return updated_group;
end;
$$;
grant execute on function public.complete_rekber_custody(uuid) to authenticated;

create or replace function public.submit_rekber_buyer_rating(p_group_id uuid, p_product_rating integer, p_third_party_rating integer, p_comment text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare current_group public.rekber_groups%rowtype; request_row public.purchase_requests%rowtype;
begin
  if p_product_rating not between 1 and 5 or p_third_party_rating not between 1 and 5 then raise exception 'Rating harus antara 1 sampai 5'; end if;
  select * into current_group from public.rekber_groups where id = p_group_id and status = 'active';
  if current_group.id is null or current_group.buyer_id is distinct from auth.uid() then raise exception 'Hanya Buyer pada transaksi ini yang dapat memberi rating'; end if;
  if current_group.midman_rating_requested_at is null then raise exception 'Midman (MM) belum meminta rating'; end if;
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

create or replace function public.submit_rekber_seller_rating(p_group_id uuid, p_third_party_rating integer, p_comment text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare current_group public.rekber_groups%rowtype; request_row public.purchase_requests%rowtype;
begin
  if p_third_party_rating not between 1 and 5 then raise exception 'Rating harus antara 1 sampai 5'; end if;
  select * into current_group from public.rekber_groups where id = p_group_id and status = 'active';
  if current_group.id is null or current_group.seller_id is distinct from auth.uid() then raise exception 'Hanya Seller pada transaksi ini yang dapat memberi rating'; end if;
  if current_group.midman_rating_requested_at is null then raise exception 'Midman (MM) belum meminta rating'; end if;
  select * into request_row from public.purchase_requests where id = current_group.purchase_request_id;
  insert into public.rekber_third_party_reviews(group_id, purchase_request_id, reviewer_id, third_party_id, rating, comment)
  values (current_group.id, request_row.id, auth.uid(), current_group.third_party_id, p_third_party_rating, nullif(trim(coalesce(p_comment, '')), ''))
  on conflict (group_id, reviewer_id) do nothing;
end;
$$;
grant execute on function public.submit_rekber_seller_rating(uuid, integer, text) to authenticated;

drop policy if exists "Peserta dapat memberi rating pihak ketiga" on public.rekber_third_party_reviews;
create policy "Peserta dapat memberi rating pihak ketiga" on public.rekber_third_party_reviews
  for insert with check (auth.uid() = reviewer_id and exists (
    select 1 from public.rekber_groups g
    where g.id = group_id and g.status in ('active', 'completed') and g.midman_rating_requested_at is not null
      and (auth.uid() = g.buyer_id or auth.uid() = g.seller_id) and third_party_id = g.third_party_id
  ));

notify pgrst, 'reload schema';
