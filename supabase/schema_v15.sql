-- Storichi Marketplace schema v15
-- Read receipts, sold-out inventory, and public stock lifecycle.

alter table public.chat_messages add column if not exists read_at timestamptz;
alter table public.products add column if not exists sold_out_at timestamptz;
alter table public.purchase_requests add column if not exists inventory_finalized_at timestamptz;

create index if not exists products_public_stock_idx on public.products(is_active, stock, sold_out_at);

create or replace function public.mark_chat_thread_messages_read(p_thread_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from chat_threads where id = p_thread_id and (user_a = auth.uid() or user_b = auth.uid())) then
    raise exception 'Tidak berwenang membaca thread ini';
  end if;
  update chat_messages
  set read_at = coalesce(read_at, now())
  where thread_id = p_thread_id and sender_id <> auth.uid() and read_at is null;
end;
$$;

grant execute on function public.mark_chat_thread_messages_read(uuid) to authenticated;

create or replace function public.finalize_completed_purchase_inventory()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare current_stock integer;
begin
  if new.status = 'completed' and old.status is distinct from 'completed' and new.inventory_finalized_at is null and new.rekber_group_id is null then
    select stock into current_stock from products where id = new.product_id for update;
    update products
    set sales_count = coalesce(sales_count, 0) + 1,
        stock = greatest(coalesce(current_stock, 1) - 1, 0),
        is_active = case when coalesce(current_stock, 1) <= 1 then false else is_active end,
        sold_out_at = case when coalesce(current_stock, 1) <= 1 then now() else sold_out_at end
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
end;
$$;

grant execute on function public.complete_direct_purchase(uuid, numeric) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_messages'
  ) then
    execute 'alter publication supabase_realtime add table public.chat_messages';
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'products'
  ) then
    execute 'alter publication supabase_realtime add table public.products';
  end if;
end
$$;
