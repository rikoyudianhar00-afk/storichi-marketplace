-- Storichi Marketplace schema v29
-- Third-party invitation must be accepted before the participant joins the transaction chat.
-- Regular users still require buyer approval first.
-- Jalankan setelah schema_v28.sql.

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

create or replace function public.respond_rekber_invitation(p_invitation_id uuid, p_accept boolean)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare invitation public.rekber_invitations%rowtype;
begin
  select * into invitation from public.rekber_invitations where id = p_invitation_id for update;
  if invitation.id is null or invitation.status <> 'pending' or invitation.third_party_kind <> 'regular' then raise exception 'Pengajuan pengguna biasa tidak tersedia'; end if;
  if auth.uid() is distinct from invitation.buyer_id then raise exception 'Hanya pembeli yang dapat menyetujui pengajuan pihak ketiga'; end if;
  if not p_accept then update public.rekber_invitations set status = 'declined', responded_at = now() where id = p_invitation_id; return null; end if;
  update public.rekber_invitations set buyer_approved_at = now(), status = 'buyer_approved' where id = p_invitation_id;
  return null;
end;
$$;
grant execute on function public.respond_rekber_invitation(uuid, boolean) to authenticated;

create or replace function public.respond_rekber_third_party_invitation(p_invitation_id uuid, p_accept boolean)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare invitation public.rekber_invitations%rowtype; group_id uuid;
begin
  select * into invitation from public.rekber_invitations where id = p_invitation_id for update;
  if invitation.id is null then raise exception 'Undangan pihak ketiga tidak tersedia'; end if;
  if invitation.third_party_kind = 'regular' then
    if invitation.status not in ('buyer_approved', 'accepted') then raise exception 'Undangan pengguna biasa belum disetujui pembeli atau sudah tidak tersedia'; end if;
  elsif invitation.status not in ('pending', 'accepted') then
    raise exception 'Undangan pihak ketiga sudah tidak tersedia';
  end if;
  if auth.uid() is distinct from invitation.third_party_id then raise exception 'Hanya pihak ketiga yang diundang yang dapat merespons'; end if;
  if not p_accept then update public.rekber_invitations set status = 'declined', responded_at = now() where id = p_invitation_id; return null; end if;
  update public.rekber_invitations set third_party_approved_at = now(), status = 'accepted', responded_at = now() where id = p_invitation_id;
  group_id := public.storichi_create_rekber_group(invitation.purchase_request_id, invitation.third_party_id);
  return group_id;
end;
$$;
grant execute on function public.respond_rekber_third_party_invitation(uuid, boolean) to authenticated;
