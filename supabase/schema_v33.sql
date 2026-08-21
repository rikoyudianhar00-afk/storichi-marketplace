-- Storichi Marketplace schema v33
-- Midman uploads QRIS before activation; activation sends it to Buyer.
-- Midman custody request triggers Seller QRIS and opens Seller/Buyer approvals.
-- Jalankan setelah schema_v32.sql.

alter table public.rekber_groups
  add column if not exists midman_qris_url text,
  add column if not exists midman_qris_sent_at timestamptz,
  add column if not exists custody_requested_at timestamptz;

create or replace function public.set_rekber_midman_qris(p_group_id uuid, p_qris_url text)
returns public.rekber_groups
language plpgsql security definer set search_path = public
as $$
declare updated_group public.rekber_groups;
begin
  if nullif(trim(coalesce(p_qris_url, '')), '') is null then raise exception 'QRIS Midman belum tersedia'; end if;
  update public.rekber_groups
  set midman_qris_url = p_qris_url
  where id = p_group_id and status = 'active' and third_party_id = auth.uid() and activated_at is null
  returning * into updated_group;
  if updated_group.id is null then raise exception 'Hanya Midman pada Rekber yang belum aktif yang dapat menyiapkan QRIS'; end if;
  return updated_group;
end;
$$;
grant execute on function public.set_rekber_midman_qris(uuid, text) to authenticated;

drop function if exists public.activate_rekber_account(uuid);
create or replace function public.activate_rekber_account(p_group_id uuid, p_qris_url text default null)
returns public.rekber_groups
language plpgsql security definer set search_path = public
as $$
declare current_group public.rekber_groups%rowtype; updated_group public.rekber_groups; request_thread uuid; qris_url text;
begin
  select * into current_group from public.rekber_groups where id = p_group_id and status = 'active' for update;
  if current_group.id is null or current_group.third_party_id is distinct from auth.uid() then raise exception 'Hanya Midman pada Rekber aktif yang dapat mengaktifkan rekening bersama'; end if;
  if current_group.activated_at is not null then return current_group; end if;
  qris_url := nullif(trim(coalesce(p_qris_url, current_group.midman_qris_url, '')), '');
  if qris_url is null then raise exception 'Upload QRIS Midman terlebih dahulu'; end if;
  select pr.thread_id into request_thread from public.purchase_requests pr where pr.id = current_group.purchase_request_id;
  insert into public.chat_messages(thread_id, sender_id, content, attachment_url, attachment_type, visibility)
  values (request_thread, auth.uid(), 'QRIS pembayaran dari Midman (MM) untuk Buyer', qris_url, 'qris', 'buyer_whisper');
  update public.rekber_groups
  set midman_qris_url = qris_url, midman_qris_sent_at = now(), activated_at = now(), activated_by = auth.uid()
  where id = p_group_id
  returning * into updated_group;
  return updated_group;
end;
$$;
grant execute on function public.activate_rekber_account(uuid, text) to authenticated;

create or replace function public.request_rekber_custody(p_group_id uuid)
returns public.rekber_groups
language plpgsql security definer set search_path = public
as $$
declare current_group public.rekber_groups%rowtype; updated_group public.rekber_groups; request_thread uuid; seller_qris text;
begin
  select * into current_group from public.rekber_groups where id = p_group_id and status = 'active' for update;
  if current_group.id is null or current_group.third_party_id is distinct from auth.uid() then raise exception 'Hanya Midman yang dapat meminta pengamanan dana/item'; end if;
  if current_group.activated_at is null then raise exception 'Rekening bersama belum diaktifkan'; end if;
  if current_group.custody_requested_at is not null then return current_group; end if;
  select qris_url into seller_qris from public.profiles where id = current_group.seller_id;
  select pr.thread_id into request_thread from public.purchase_requests pr where pr.id = current_group.purchase_request_id;
    if nullif(trim(coalesce(seller_qris, '')), '') is null then raise exception 'Seller harus menyiapkan QRIS sebelum Midman meminta pengamanan dana/item'; end if;
  insert into public.chat_messages(thread_id, sender_id, content, attachment_url, attachment_type, visibility)
  values (request_thread, current_group.seller_id, 'QRIS Seller untuk Midman (MM)', seller_qris, 'qris', 'seller_whisper');
  update public.rekber_groups
  set custody_requested_at = now(), qris_to_third_party_sent_at = now()
  where id = p_group_id
  returning * into updated_group;
  return updated_group;
end;
$$;
grant execute on function public.request_rekber_custody(uuid) to authenticated;

create or replace function public.mark_rekber_party_done(p_group_id uuid)
returns public.rekber_groups
language plpgsql security definer set search_path = public
as $$
declare current_group public.rekber_groups%rowtype; updated_group public.rekber_groups;
begin
  select * into current_group from public.rekber_groups where id = p_group_id and status = 'active' for update;
  if current_group.id is null or current_group.activated_at is null then raise exception 'Rekening bersama belum diaktifkan Midman'; end if;
  if current_group.custody_requested_at is null or current_group.qris_to_third_party_sent_at is null then raise exception 'Midman harus meminta pengamanan dan QRIS Seller harus dikirim terlebih dahulu'; end if;
  if auth.uid() = current_group.buyer_id then
    update public.rekber_groups set buyer_done_at = coalesce(buyer_done_at, now()) where id = p_group_id;
  elsif auth.uid() = current_group.seller_id then
    update public.rekber_groups set seller_done_at = coalesce(seller_done_at, now()) where id = p_group_id;
  else
    raise exception 'Hanya Buyer atau Seller yang dapat menyatakan persetujuan';
  end if;
  select * into updated_group from public.rekber_groups where id = p_group_id;
  return updated_group;
end;
$$;
grant execute on function public.mark_rekber_party_done(uuid) to authenticated;
