-- Storichi Marketplace schema v24
-- Quantity-aware direct purchase completion.
-- Jalankan setelah schema_v23.sql.

alter table public.purchase_requests
  add column if not exists item_quantity integer not null default 1;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'purchase_requests_item_quantity_check'
  ) then
    alter table public.purchase_requests
      add constraint purchase_requests_item_quantity_check check (item_quantity >= 1);
  end if;
end $$;

create index if not exists purchase_requests_item_quantity_idx
  on public.purchase_requests(item_quantity);

create or replace function public.finalize_completed_purchase_inventory()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  current_stock integer;
  completed_quantity integer := greatest(coalesce(new.item_quantity, 1), 1);
begin
  if new.status = 'completed'
     and old.status is distinct from 'completed'
     and new.inventory_finalized_at is null
     and new.rekber_group_id is null then
    select stock into current_stock
    from public.products
    where id = new.product_id
    for update;

    if coalesce(current_stock, 0) < completed_quantity then
      raise exception 'Stok produk tidak mencukupi untuk jumlah barang yang diselesaikan';
    end if;

    update public.products
    set sales_count = coalesce(sales_count, 0) + completed_quantity,
        stock = greatest(coalesce(current_stock, 0) - completed_quantity, 0),
        is_active = case when coalesce(current_stock, 0) <= completed_quantity then false else is_active end,
        sold_out_at = case when coalesce(current_stock, 0) <= completed_quantity then now() else sold_out_at end
    where id = new.product_id;

    new.inventory_finalized_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists purchase_request_inventory_trigger on public.purchase_requests;
create trigger purchase_request_inventory_trigger
before update of status on public.purchase_requests
for each row execute function public.finalize_completed_purchase_inventory();

drop function if exists public.complete_direct_purchase(uuid, numeric);

drop function if exists public.complete_direct_purchase(uuid, numeric, integer);

create function public.complete_direct_purchase(
  p_request_id uuid,
  p_final_price numeric,
  p_item_quantity integer default 1
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  req public.purchase_requests%rowtype;
  available_stock integer;
  moderation_notice text;
begin
  if p_final_price is null or p_final_price <= 0 then
    raise exception 'Harga final harus lebih besar dari nol';
  end if;
  if p_item_quantity is null or p_item_quantity < 1 or p_item_quantity <> floor(p_item_quantity) then
    raise exception 'Jumlah barang harus berupa bilangan bulat minimal 1';
  end if;

  select * into req
  from public.purchase_requests
  where id = p_request_id;

  if req.id is null or req.status <> 'approved' or req.purchase_mode <> 'direct' then
    raise exception 'Pembelian langsung belum aktif';
  end if;
  if auth.uid() is distinct from req.seller_id then
    raise exception 'Hanya penjual yang dapat menekan DONE';
  end if;
  if req.buyer_rating is null then
    raise exception 'Pembeli harus memberi rating terlebih dahulu';
  end if;

  perform public.storichi_assert_accounts_allowed(req.buyer_id, req.seller_id);

  select stock into available_stock
  from public.products
  where id = req.product_id
  for update;
  if coalesce(available_stock, 0) < p_item_quantity then
    raise exception 'Stok produk tidak mencukupi untuk jumlah barang tersebut';
  end if;

  update public.purchase_requests
  set status = 'completed',
      final_price = p_final_price,
      item_quantity = p_item_quantity,
      seller_done_at = now(),
      completed_at = now()
  where id = p_request_id;

  select public.storichi_record_completed_pair(p_request_id) into moderation_notice;
  return moderation_notice;
end;
$$;

grant execute on function public.complete_direct_purchase(uuid, numeric, integer) to authenticated;
