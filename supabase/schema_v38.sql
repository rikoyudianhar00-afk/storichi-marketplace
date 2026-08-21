-- Storichi Marketplace schema v38
-- Preserve complete Rekber result data for Transactions.
-- Run after schema_v37.sql.

update public.purchase_requests pr
set final_price = p.price_from * greatest(coalesce(pr.item_quantity, 1), 1)
from public.products p
where pr.product_id = p.id
  and pr.status = 'completed'
  and pr.final_price is null
  and p.price_from is not null;

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
  product_unit_price numeric;
  final_transaction_price numeric;
  rating_count integer;
begin
  select * into current_group
  from public.rekber_groups
  where id = p_group_id and status = 'active'
  for update;

  if current_group.id is null or current_group.third_party_id is distinct from auth.uid() then
    raise exception 'Hanya Midman (MM) yang dapat menyelesaikan custody';
  end if;
  if current_group.activated_at is null or current_group.buyer_done_at is null or current_group.seller_done_at is null then
    raise exception 'Seller dan Buyer harus menyelesaikan konfirmasi terlebih dahulu';
  end if;
  if current_group.qris_to_third_party_sent_at is null then
    raise exception 'QRIS Seller belum dikirim kepada Midman (MM)';
  end if;
  if current_group.midman_rating_requested_at is null then
    raise exception 'Midman (MM) harus meminta rating terlebih dahulu';
  end if;

  select count(*) into rating_count
  from public.rekber_third_party_reviews
  where group_id = p_group_id
    and reviewer_id in (current_group.buyer_id, current_group.seller_id);
  if rating_count < 2 then
    raise exception 'Menunggu rating Seller dan Buyer sebelum custody diselesaikan';
  end if;

  select * into request_row
  from public.purchase_requests
  where id = current_group.purchase_request_id
  for update;
  quantity := greatest(coalesce(request_row.item_quantity, 1), 1);

  select stock, price_from
  into available_stock, product_unit_price
  from public.products
  where id = request_row.product_id
  for update;

  if coalesce(available_stock, 0) < quantity then
    raise exception 'Stok produk tidak mencukupi';
  end if;

  final_transaction_price := coalesce(request_row.final_price, product_unit_price * quantity);
  if final_transaction_price is null or final_transaction_price <= 0 then
    raise exception 'Harga transaksi belum tersedia';
  end if;

  update public.rekber_groups
  set status = 'completed',
      workflow_status = 'released',
      custody_completed_at = now(),
      released_at = now()
  where id = p_group_id;

  update public.purchase_requests
  set status = 'completed',
      final_price = final_transaction_price,
      completed_at = now(),
      seller_done_at = coalesce(seller_done_at, now())
  where id = request_row.id;

  update public.products
  set sales_count = coalesce(sales_count, 0) + quantity,
      stock = greatest(coalesce(available_stock, 0) - quantity, 0),
      is_active = case when coalesce(available_stock, 0) <= quantity then false else is_active end,
      sold_out_at = case when coalesce(available_stock, 0) <= quantity then now() else sold_out_at end
  where id = request_row.product_id;

  select * into updated_group from public.rekber_groups where id = p_group_id;
  return updated_group;
end;
$$;

grant execute on function public.complete_rekber_custody(uuid) to authenticated;
