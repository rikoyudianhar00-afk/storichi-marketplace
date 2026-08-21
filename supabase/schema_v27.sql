-- Storichi Marketplace schema v27
-- Rekber di thread chat yang sama: whispering, aktivasi rekening bersama, custody, dan rating pihak ketiga.
-- Jalankan setelah schema_v26.sql.

alter table public.chat_messages
  add column if not exists visibility text not null default 'main';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'chat_messages_visibility_check') then
    alter table public.chat_messages add constraint chat_messages_visibility_check check (visibility in ('main', 'seller_whisper', 'buyer_whisper'));
  end if;
end $$;

alter table public.rekber_groups
  add column if not exists activated_at timestamptz,
  add column if not exists activated_by uuid references public.profiles(id),
  add column if not exists buyer_done_at timestamptz,
  add column if not exists seller_done_at timestamptz,
  add column if not exists qris_to_third_party_sent_at timestamptz,
  add column if not exists custody_completed_at timestamptz;

create index if not exists chat_messages_visibility_idx on public.chat_messages(thread_id, visibility, created_at);

create table if not exists public.rekber_third_party_reviews (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references public.rekber_groups(id) on delete cascade not null,
  purchase_request_id uuid references public.purchase_requests(id) on delete cascade not null,
  reviewer_id uuid references public.profiles(id) on delete cascade not null,
  third_party_id uuid references public.profiles(id) on delete cascade not null,
  rating integer not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  unique (group_id, reviewer_id)
);

alter table public.rekber_third_party_reviews enable row level security;
drop policy if exists "Peserta dapat melihat rating pihak ketiga" on public.rekber_third_party_reviews;
create policy "Peserta dapat melihat rating pihak ketiga" on public.rekber_third_party_reviews
  for select using (exists (
    select 1 from public.rekber_groups g
    where g.id = group_id and (auth.uid() = g.buyer_id or auth.uid() = g.seller_id or auth.uid() = g.third_party_id)
  ));
drop policy if exists "Peserta dapat memberi rating pihak ketiga" on public.rekber_third_party_reviews;
create policy "Peserta dapat memberi rating pihak ketiga" on public.rekber_third_party_reviews
  for insert with check (auth.uid() = reviewer_id and exists (
    select 1 from public.rekber_groups g
    where g.id = group_id and g.status = 'completed' and (auth.uid() = g.buyer_id or auth.uid() = g.seller_id)
      and third_party_id = g.third_party_id
  ));

-- Semua peserta melihat main chat. Whisper hanya terlihat oleh pihak yang dituju dan pihak ketiga.
drop policy if exists "User bisa baca pesan miliknya atau Rekber" on public.chat_messages;
drop policy if exists "User bisa baca pesan thread miliknya" on public.chat_messages;
drop policy if exists "Peserta bisa baca chat dan whisper Rekber" on public.chat_messages;
create policy "Peserta bisa baca chat dan whisper Rekber" on public.chat_messages
  for select using (
    exists (
      select 1 from public.chat_threads t
      where t.id = thread_id
        and (t.user_a = auth.uid() or t.user_b = auth.uid() or public.storichi_is_rekber_thread_member(t.id))
    )
    and (
      visibility = 'main'
      or (
        visibility = 'seller_whisper'
        and exists (
          select 1 from public.purchase_requests pr
          join public.rekber_groups rg on rg.id = pr.rekber_group_id
          where pr.thread_id = chat_messages.thread_id and rg.status in ('active', 'completed')
            and (auth.uid() = rg.seller_id or auth.uid() = rg.third_party_id)
        )
      )
      or (
        visibility = 'buyer_whisper'
        and exists (
          select 1 from public.purchase_requests pr
          join public.rekber_groups rg on rg.id = pr.rekber_group_id
          where pr.thread_id = chat_messages.thread_id and rg.status in ('active', 'completed')
            and (auth.uid() = rg.buyer_id or auth.uid() = rg.third_party_id)
        )
      )
    )
  );

drop policy if exists "User bisa kirim pesan miliknya atau Rekber aktif" on public.chat_messages;
drop policy if exists "User bisa kirim pesan di thread miliknya" on public.chat_messages;
drop policy if exists "Peserta bisa kirim chat dan whisper Rekber" on public.chat_messages;
create policy "Peserta bisa kirim chat dan whisper Rekber" on public.chat_messages
  for insert with check (
    auth.uid() = sender_id
    and exists (
      select 1 from public.chat_threads t
      where t.id = thread_id
        and (t.user_a = auth.uid() or t.user_b = auth.uid() or public.storichi_is_rekber_thread_member(t.id))
    )
    and (
      visibility = 'main'
      or (
        visibility = 'seller_whisper'
        and exists (
          select 1 from public.purchase_requests pr
          join public.rekber_groups rg on rg.id = pr.rekber_group_id
          where pr.thread_id = chat_messages.thread_id and rg.status = 'active'
            and (auth.uid() = rg.seller_id or auth.uid() = rg.third_party_id)
        )
      )
      or (
        visibility = 'buyer_whisper'
        and exists (
          select 1 from public.purchase_requests pr
          join public.rekber_groups rg on rg.id = pr.rekber_group_id
          where pr.thread_id = chat_messages.thread_id and rg.status = 'active'
            and (auth.uid() = rg.buyer_id or auth.uid() = rg.third_party_id)
        )
      )
    )
  );

create or replace function public.activate_rekber_account(p_group_id uuid)
returns public.rekber_groups
language plpgsql security definer set search_path = public
as $$
declare updated_group public.rekber_groups;
begin
  update public.rekber_groups
  set activated_at = coalesce(activated_at, now()), activated_by = coalesce(activated_by, auth.uid())
  where id = p_group_id and status = 'active' and third_party_id = auth.uid()
  returning * into updated_group;
  if updated_group.id is null then raise exception 'Hanya pihak ketiga pada Rekber aktif yang dapat mengaktifkan rekening bersama'; end if;
  return updated_group;
end;
$$;
grant execute on function public.activate_rekber_account(uuid) to authenticated;

create or replace function public.mark_rekber_party_done(p_group_id uuid)
returns public.rekber_groups
language plpgsql security definer set search_path = public
as $$
declare current_group public.rekber_groups%rowtype; updated_group public.rekber_groups;
begin
  select * into current_group from public.rekber_groups where id = p_group_id and status = 'active' for update;
  if current_group.id is null or current_group.activated_at is null then raise exception 'Rekening bersama belum diaktifkan pihak ketiga'; end if;
  if auth.uid() = current_group.buyer_id then
    update public.rekber_groups set buyer_done_at = coalesce(buyer_done_at, now()) where id = p_group_id;
  elsif auth.uid() = current_group.seller_id then
    update public.rekber_groups set seller_done_at = coalesce(seller_done_at, now()) where id = p_group_id;
  else
    raise exception 'Hanya pembeli atau penjual yang dapat menyatakan transaksi siap diselesaikan';
  end if;
  select * into updated_group from public.rekber_groups where id = p_group_id;
  return updated_group;
end;
$$;
grant execute on function public.mark_rekber_party_done(uuid) to authenticated;

create or replace function public.send_rekber_qris(p_group_id uuid, p_qris_url text)
returns public.chat_messages
language plpgsql security definer set search_path = public
as $$
declare current_group public.rekber_groups%rowtype; request_thread uuid; qris_message public.chat_messages;
begin
  if nullif(trim(coalesce(p_qris_url, '')), '') is null then raise exception 'QRIS belum tersedia'; end if;
  select * into current_group from public.rekber_groups where id = p_group_id and status = 'active';
  if current_group.id is null or current_group.seller_id is distinct from auth.uid() then raise exception 'Hanya penjual dapat mengirim QRIS ke pihak ketiga'; end if;
  select thread_id into request_thread from public.purchase_requests where id = current_group.purchase_request_id;
  insert into public.chat_messages(thread_id, sender_id, content, attachment_url, attachment_type, visibility)
  values (request_thread, auth.uid(), 'QRIS pembayaran untuk pihak ketiga', p_qris_url, 'qris', 'seller_whisper')
  returning * into qris_message;
  update public.rekber_groups set qris_to_third_party_sent_at = now() where id = p_group_id;
  return qris_message;
end;
$$;
grant execute on function public.send_rekber_qris(uuid, text) to authenticated;

create or replace function public.complete_rekber_custody(p_group_id uuid)
returns public.rekber_groups
language plpgsql security definer set search_path = public
as $$
declare current_group public.rekber_groups%rowtype; updated_group public.rekber_groups; request_row public.purchase_requests%rowtype; available_stock integer; quantity integer;
begin
  select * into current_group from public.rekber_groups where id = p_group_id and status = 'active' for update;
  if current_group.id is null or current_group.third_party_id is distinct from auth.uid() then raise exception 'Hanya pihak ketiga yang dapat menyelesaikan pengamanan'; end if;
  if current_group.activated_at is null or current_group.buyer_done_at is null or current_group.seller_done_at is null then raise exception 'Pembeli dan penjual harus menyelesaikan konfirmasi terlebih dahulu'; end if;
  if current_group.qris_to_third_party_sent_at is null then raise exception 'QRIS seller belum dikirim kepada pihak ketiga'; end if;
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
language plpgsql security definer set search_path = public
as $$
declare current_group public.rekber_groups%rowtype; request_row public.purchase_requests%rowtype;
begin
  if p_product_rating not between 1 and 5 or p_third_party_rating not between 1 and 5 then raise exception 'Rating harus antara 1 sampai 5'; end if;
  select * into current_group from public.rekber_groups where id = p_group_id and status = 'completed';
  if current_group.id is null or current_group.buyer_id is distinct from auth.uid() then raise exception 'Hanya pembeli pada transaksi selesai yang dapat memberi rating'; end if;
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
language plpgsql security definer set search_path = public
as $$
declare current_group public.rekber_groups%rowtype; request_row public.purchase_requests%rowtype;
begin
  if p_third_party_rating not between 1 and 5 then raise exception 'Rating harus antara 1 sampai 5'; end if;
  select * into current_group from public.rekber_groups where id = p_group_id and status = 'completed';
  if current_group.id is null or current_group.seller_id is distinct from auth.uid() then raise exception 'Hanya penjual pada transaksi selesai yang dapat memberi rating'; end if;
  select * into request_row from public.purchase_requests where id = current_group.purchase_request_id;
  insert into public.rekber_third_party_reviews(group_id, purchase_request_id, reviewer_id, third_party_id, rating, comment)
  values (current_group.id, request_row.id, auth.uid(), current_group.third_party_id, p_third_party_rating, nullif(trim(coalesce(p_comment, '')), ''))
  on conflict (group_id, reviewer_id) do nothing;
end;
$$;
grant execute on function public.submit_rekber_seller_rating(uuid, integer, text) to authenticated;

do $$
begin
  begin
    alter publication supabase_realtime add table public.rekber_third_party_reviews;
  exception when duplicate_object then
    null;
  end;
end $$;
