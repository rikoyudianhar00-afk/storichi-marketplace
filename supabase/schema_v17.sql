-- Storichi Marketplace schema v17
-- Seller QRIS flow before direct-purchase rating and seller-store reviews.
-- Jalankan setelah schema_v16.sql.

alter table public.profiles add column if not exists qris_url text;
alter table public.profiles add column if not exists qris_updated_at timestamptz;
alter table public.purchase_requests add column if not exists qris_sent_at timestamptz;

create index if not exists purchase_requests_qris_status_idx
  on public.purchase_requests(seller_id, purchase_mode, status, qris_sent_at);

-- Keep the seller-store review table compatible with direct purchases.
alter table public.seller_reviews add column if not exists purchase_request_id uuid references public.purchase_requests(id);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'seller_reviews_purchase_request_unique'
  ) then
    alter table public.seller_reviews
      add constraint seller_reviews_purchase_request_unique unique (purchase_request_id);
  end if;
end
$$;

create or replace function public.send_direct_purchase_qris(p_request_id uuid, p_qris_url text)
returns public.chat_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  req public.purchase_requests%rowtype;
  qris_message public.chat_messages;
begin
  if nullif(trim(coalesce(p_qris_url, '')), '') is null then
    raise exception 'QRIS toko belum disiapkan';
  end if;

  select * into req
  from public.purchase_requests
  where id = p_request_id;

  if req.id is null or req.status <> 'approved' or req.purchase_mode <> 'direct' then
    raise exception 'Pembelian langsung belum aktif';
  end if;
  if auth.uid() is distinct from req.seller_id then
    raise exception 'Hanya penjual yang dapat memberikan QRIS';
  end if;

  insert into public.chat_messages(
    thread_id, sender_id, content, attachment_url, attachment_type, attachment_size_bytes
  ) values (
    req.thread_id,
    auth.uid(),
    'QRIS pembayaran toko',
    trim(p_qris_url),
    'qris',
    null
  ) returning * into qris_message;

  update public.purchase_requests
  set qris_sent_at = now()
  where id = req.id;

  return qris_message;
end;
$$;

grant execute on function public.send_direct_purchase_qris(uuid, text) to authenticated;

create or replace function public.request_direct_rating(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare req public.purchase_requests%rowtype;
begin
  select * into req from public.purchase_requests where id = p_request_id;
  if req.id is null or req.status <> 'approved' or req.purchase_mode <> 'direct' then
    raise exception 'Pembelian langsung belum aktif';
  end if;
  if auth.uid() is distinct from req.seller_id then
    raise exception 'Hanya penjual yang dapat meminta rating';
  end if;
  if req.qris_sent_at is null then
    raise exception 'Penjual harus memberikan QRIS terlebih dahulu';
  end if;
  if req.buyer_rating is not null then
    raise exception 'Rating sudah diberikan';
  end if;
  update public.purchase_requests set rating_requested_at = now() where id = p_request_id;
end;
$$;

grant execute on function public.request_direct_rating(uuid) to authenticated;

create or replace function public.submit_direct_rating(p_request_id uuid, p_rating integer, p_comment text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare req public.purchase_requests%rowtype;
begin
  if p_rating < 1 or p_rating > 5 then
    raise exception 'Rating harus antara 1 sampai 5';
  end if;
  select * into req from public.purchase_requests where id = p_request_id;
  if req.id is null or req.status <> 'approved' or req.purchase_mode <> 'direct' then
    raise exception 'Pembelian langsung belum aktif';
  end if;
  if auth.uid() is distinct from req.buyer_id then
    raise exception 'Hanya pembeli yang dapat memberi rating';
  end if;
  if req.rating_requested_at is null then
    raise exception 'Penjual belum meminta rating';
  end if;
  if req.buyer_rating is not null then
    raise exception 'Rating sudah diberikan';
  end if;

  insert into public.product_reviews(product_id, purchase_request_id, buyer_id, seller_id, rating, comment)
  values (req.product_id, req.id, req.buyer_id, req.seller_id, p_rating, nullif(trim(coalesce(p_comment, '')), ''));

  insert into public.seller_reviews(seller_id, reviewer_id, purchase_request_id, rating, comment)
  values (req.seller_id, req.buyer_id, req.id, p_rating, nullif(trim(coalesce(p_comment, '')), ''))
  on conflict (purchase_request_id) do nothing;

  update public.purchase_requests
  set buyer_rating = p_rating,
      buyer_rating_comment = nullif(trim(coalesce(p_comment, '')), ''),
      rating_requested_at = null
  where id = p_request_id;
end;
$$;

grant execute on function public.submit_direct_rating(uuid, integer, text) to authenticated;

-- Public reads are already present in the base schema; these statements make the
-- intended access explicit for databases where the old policy was customized.
alter table public.seller_reviews enable row level security;
drop policy if exists "Public can read seller reviews" on public.seller_reviews;
create policy "Public can read seller reviews" on public.seller_reviews
  for select using (true);

-- QRIS cards use the existing public chat-attachments bucket.
insert into storage.buckets (id, name, public)
values ('chat-attachments', 'chat-attachments', true)
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'seller_reviews'
  ) then
    execute 'alter publication supabase_realtime add table public.seller_reviews';
  end if;
end
$$;
