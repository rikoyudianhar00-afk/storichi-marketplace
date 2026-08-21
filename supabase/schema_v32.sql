-- Storichi Marketplace schema v32
-- Prevent an account from joining another unfinished Rekber.
-- Jalankan setelah schema_v31.sql.

create or replace function public.storichi_assert_no_active_rekber(p_user_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if p_user_id is null then return; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  if exists (
    select 1
    from public.rekber_groups g
    where g.status = 'active'
      and (g.buyer_id = p_user_id or g.seller_id = p_user_id or g.third_party_id = p_user_id)
  ) then
    raise exception 'Akun masih memiliki proses Rekber yang belum selesai';
  end if;
end;
$$;
revoke all on function public.storichi_assert_no_active_rekber(uuid) from public;

create or replace function public.storichi_create_rekber_group(p_purchase_request_id uuid, p_third_party_id uuid)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  req public.purchase_requests%rowtype;
  candidate public.profiles%rowtype;
  product_name text;
  new_group_id uuid;
  new_code text;
  candidate_kind text;
begin
  select * into req from public.purchase_requests where id = p_purchase_request_id for update;
  if req.id is null or req.status <> 'approved' or req.rekber_group_id is not null then raise exception 'Permintaan belum disetujui atau Rekber sudah dibuat'; end if;
  if p_third_party_id is null or p_third_party_id in (req.buyer_id, req.seller_id) then raise exception 'Pihak ketiga tidak valid'; end if;
  if auth.uid() is distinct from req.seller_id and auth.uid() is distinct from req.buyer_id then
    if auth.uid() is distinct from p_third_party_id or not exists (select 1 from public.rekber_invitations i where i.purchase_request_id = req.id and i.third_party_id = p_third_party_id and i.status = 'accepted' and i.third_party_approved_at is not null) then
      raise exception 'Hanya peserta yang berwenang dapat membuat lobby';
    end if;
  end if;
  perform public.storichi_assert_no_active_rekber(req.buyer_id);
  perform public.storichi_assert_no_active_rekber(req.seller_id);
  perform public.storichi_assert_no_active_rekber(p_third_party_id);
  select * into candidate from public.profiles where id = p_third_party_id;
  if candidate.id is null then raise exception 'Profil pihak ketiga tidak ditemukan'; end if;
  candidate_kind := case when candidate.is_midman then 'midman' when candidate.is_verified then 'verified' else 'regular' end;
  select name into product_name from public.products where id = req.product_id;
  loop
    new_code := 'RB-' || upper(substr(md5(random()::text), 1, 5));
    exit when not exists (select 1 from public.rekber_groups g where g.code = new_code);
  end loop;
  insert into public.rekber_groups (name, code, created_by, purchase_request_id, buyer_id, seller_id, midman_id, third_party_id, third_party_kind, status, workflow_status)
  values ('Rekber: ' || coalesce(product_name, 'Transaksi'), new_code, auth.uid(), req.id, req.buyer_id, req.seller_id, case when candidate_kind = 'midman' then candidate.id else null end, candidate.id, candidate_kind, 'active', 'waiting_for_deposit')
  returning id into new_group_id;
  insert into public.rekber_members (group_id, user_id, role)
  values (new_group_id, req.buyer_id, 'buyer'), (new_group_id, req.seller_id, 'seller'), (new_group_id, candidate.id, case when candidate_kind = 'midman' then 'midman' else 'third_party' end);
  update public.purchase_requests set rekber_group_id = new_group_id where id = req.id;
  return new_group_id;
end;
$$;
grant execute on function public.storichi_create_rekber_group(uuid, uuid) to authenticated;

create or replace function public.invite_rekber_third_party(p_purchase_request_id uuid, p_third_party_id uuid)
returns public.rekber_invitations
language plpgsql security definer set search_path = public
as $$
declare req public.purchase_requests%rowtype; candidate public.profiles%rowtype; invitation public.rekber_invitations%rowtype; candidate_kind text;
begin
  select * into req from public.purchase_requests where id = p_purchase_request_id for update;
  if req.id is null or req.status <> 'approved' or req.rekber_group_id is not null then raise exception 'Permintaan belum disetujui atau Rekber sudah dibuat'; end if;
  if auth.uid() is distinct from req.seller_id then raise exception 'Hanya penjual yang dapat mengundang pihak ketiga'; end if;
  if p_third_party_id in (req.buyer_id, req.seller_id) then raise exception 'Pihak ketiga tidak valid'; end if;
  perform public.storichi_assert_no_active_rekber(auth.uid());
  perform public.storichi_assert_no_active_rekber(p_third_party_id);
  select * into candidate from public.profiles where id = p_third_party_id;
  if candidate.id is null then raise exception 'Profil pihak ketiga tidak ditemukan'; end if;
  candidate_kind := case when candidate.is_midman then 'midman' when candidate.is_verified then 'verified' else 'regular' end;
  insert into public.rekber_invitations (purchase_request_id, inviter_id, buyer_id, seller_id, third_party_id, third_party_kind, status, seller_approved_at)
  values (req.id, auth.uid(), req.buyer_id, req.seller_id, candidate.id, candidate_kind, 'pending', now())
  on conflict (purchase_request_id) do update set third_party_id = excluded.third_party_id, third_party_kind = excluded.third_party_kind, status = 'pending', seller_approved_at = now(), buyer_approved_at = null, third_party_approved_at = null, responded_at = null
  returning * into invitation;
  update public.profiles set rekber_invite_count = coalesce(rekber_invite_count, 0) + 1 where id = candidate.id;
  return invitation;
end;
$$;
grant execute on function public.invite_rekber_third_party(uuid, uuid) to authenticated;
