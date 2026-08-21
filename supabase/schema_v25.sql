-- Storichi Marketplace schema v25
-- Third-party Rekber picker: Midman, verified, and regular users.
-- Jalankan setelah schema_v24.sql.

alter table public.profiles add column if not exists rekber_invite_count integer not null default 0;

alter table public.rekber_groups
  add column if not exists third_party_id uuid references public.profiles(id),
  add column if not exists third_party_kind text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'rekber_groups_third_party_kind_check') then
    alter table public.rekber_groups add constraint rekber_groups_third_party_kind_check check (third_party_kind is null or third_party_kind in ('midman', 'verified', 'regular'));
  end if;
end $$;

create index if not exists rekber_groups_third_party_idx on public.rekber_groups(third_party_id, status);

create table if not exists public.rekber_invitations (
  id uuid primary key default gen_random_uuid(),
  purchase_request_id uuid references public.purchase_requests(id) on delete cascade not null,
  inviter_id uuid references public.profiles(id) not null,
  buyer_id uuid references public.profiles(id) not null,
  seller_id uuid references public.profiles(id) not null,
  third_party_id uuid references public.profiles(id) not null,
  third_party_kind text not null check (third_party_kind in ('midman', 'verified', 'regular')),
  status text not null default 'pending' check (status in ('pending', 'buyer_approved', 'accepted', 'declined', 'expired')),
  seller_approved_at timestamptz,
  buyer_approved_at timestamptz,
  third_party_approved_at timestamptz,
  responded_at timestamptz,
  created_at timestamptz default now(),
  unique (purchase_request_id)
);

alter table public.rekber_invitations enable row level security;
drop policy if exists "Peserta dapat melihat undangan Rekber" on public.rekber_invitations;
create policy "Peserta dapat melihat undangan Rekber" on public.rekber_invitations
  for select using (auth.uid() = buyer_id or auth.uid() = seller_id or auth.uid() = third_party_id);

create index if not exists rekber_invitations_third_party_idx on public.rekber_invitations(third_party_id, status, created_at desc);

create or replace function public.storichi_create_rekber_group(
  p_purchase_request_id uuid,
  p_third_party_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
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
    if auth.uid() is distinct from p_third_party_id or not exists (select 1 from public.rekber_invitations i where i.purchase_request_id = req.id and i.third_party_id = p_third_party_id and i.status = 'accepted' and i.buyer_approved_at is not null and i.third_party_approved_at is not null) then
      raise exception 'Hanya peserta yang berwenang dapat membuat lobby';
    end if;
  end if;

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

create or replace function public.create_rekber_lobby_with_third_party(p_purchase_request_id uuid, p_third_party_id uuid)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare candidate public.profiles%rowtype; group_id uuid;
begin
  select * into candidate from public.profiles where id = p_third_party_id;
  if candidate.id is null then raise exception 'Profil pihak ketiga tidak ditemukan'; end if;
  if not candidate.is_verified and not candidate.is_midman then raise exception 'Pengguna biasa harus melalui persetujuan pembeli'; end if;
  group_id := public.storichi_create_rekber_group(p_purchase_request_id, p_third_party_id);
  return group_id;
end;
$$;
grant execute on function public.create_rekber_lobby_with_third_party(uuid, uuid) to authenticated;

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
  if candidate_kind in ('midman', 'verified') then raise exception 'Gunakan pembuatan lobby langsung untuk Midman atau verified'; end if;
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
  if invitation.id is null or invitation.status not in ('pending', 'buyer_approved') then raise exception 'Undangan Rekber tidak tersedia'; end if;
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
  if invitation.id is null or invitation.status not in ('buyer_approved', 'accepted') then raise exception 'Undangan pihak ketiga belum disetujui pembeli atau sudah tidak tersedia'; end if;
  if auth.uid() is distinct from invitation.third_party_id then raise exception 'Hanya pihak ketiga yang diundang yang dapat merespons'; end if;
  if not p_accept then update public.rekber_invitations set status = 'declined', responded_at = now() where id = p_invitation_id; return null; end if;
  update public.rekber_invitations set third_party_approved_at = now(), status = 'accepted', responded_at = now() where id = p_invitation_id;
  group_id := public.storichi_create_rekber_group(invitation.purchase_request_id, invitation.third_party_id);
  return group_id;
end;
$$;
grant execute on function public.respond_rekber_third_party_invitation(uuid, boolean) to authenticated;

create or replace function public.choose_direct_purchase(p_request_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare req public.purchase_requests%rowtype;
begin
  select * into req from public.purchase_requests where id = p_request_id for update;
  if req.id is null or req.status <> 'approved' then raise exception 'Permintaan belum disetujui'; end if;
  if auth.uid() is distinct from req.seller_id then raise exception 'Hanya penjual yang dapat memilih tanpa Rekber'; end if;
  perform public.storichi_assert_accounts_allowed(req.buyer_id, req.seller_id);
  update public.rekber_invitations set status = 'expired', responded_at = coalesce(responded_at, now()) where purchase_request_id = req.id and status in ('pending', 'buyer_approved');
  update public.purchase_requests set purchase_mode = 'direct' where id = p_request_id;
end;
$$;
grant execute on function public.choose_direct_purchase(uuid) to authenticated;

drop policy if exists "Peserta bisa melihat grup rekber" on public.rekber_groups;
create policy "Peserta bisa melihat grup rekber" on public.rekber_groups for select using (auth.uid() = buyer_id or auth.uid() = seller_id or auth.uid() = midman_id or auth.uid() = third_party_id or exists (select 1 from public.rekber_members m where m.group_id = id and m.user_id = auth.uid()));

drop policy if exists "Peserta bisa melihat anggota lobby" on public.rekber_members;
create policy "Peserta bisa melihat anggota lobby" on public.rekber_members for select using (exists (select 1 from public.rekber_groups g where g.id = group_id and (auth.uid() = g.buyer_id or auth.uid() = g.seller_id or auth.uid() = g.midman_id or auth.uid() = g.third_party_id)));
EOF


-- Allow the designated third party to operate the escrow workflow.
create or replace function public.update_rekber_workflow(p_group_id uuid, p_action text)
returns public.rekber_groups
language plpgsql
security definer
set search_path = public
as $$
declare
  current_group public.rekber_groups%rowtype;
  updated_group public.rekber_groups%rowtype;
  request_product_id uuid;
  request_quantity integer;
  available_stock integer;
  operator_id uuid;
begin
  select * into current_group from public.rekber_groups where id = p_group_id and status = 'active' for update;
  if current_group.id is null then raise exception 'Lobby Rekber tidak ditemukan atau sudah tidak aktif'; end if;
  operator_id := coalesce(current_group.midman_id, current_group.third_party_id);
  if auth.uid() is distinct from operator_id then raise exception 'Hanya pihak ketiga yang dipilih dapat mengubah status penitipan dan pelepasan'; end if;
  select product_id, greatest(coalesce(item_quantity, 1), 1) into request_product_id, request_quantity from public.purchase_requests where id = current_group.purchase_request_id;

  if p_action = 'confirm_funds' then
    update public.rekber_groups set funds_status = 'held', funds_confirmed_at = now(), workflow_status = case when item_status = 'held' then 'ready_to_release' else 'waiting_for_item' end where id = p_group_id;
  elsif p_action = 'confirm_item' then
    update public.rekber_groups set item_status = 'held', item_confirmed_at = now(), workflow_status = case when funds_status = 'held' then 'ready_to_release' else 'waiting_for_deposit' end where id = p_group_id;
  elsif p_action = 'release' then
    if current_group.funds_status <> 'held' or current_group.item_status <> 'held' then raise exception 'Dana dan item harus dikonfirmasi dipegang pihak ketiga sebelum dilepas'; end if;
    select stock into available_stock from public.products where id = request_product_id for update;
    if coalesce(available_stock, 0) < request_quantity then raise exception 'Stok produk tidak mencukupi untuk jumlah transaksi'; end if;
    update public.rekber_groups set workflow_status = 'released', status = 'completed', released_at = now() where id = p_group_id;
    update public.purchase_requests set status = 'completed' where rekber_group_id = p_group_id;
    update public.products set sales_count = coalesce(sales_count, 0) + request_quantity, stock = greatest(coalesce(available_stock, 0) - request_quantity, 0), is_active = case when coalesce(available_stock, 0) <= request_quantity then false else is_active end, sold_out_at = case when coalesce(available_stock, 0) <= request_quantity then now() else sold_out_at end where id = request_product_id;
  else
    raise exception 'Aksi workflow tidak dikenal';
  end if;
  select * into updated_group from public.rekber_groups where id = p_group_id;
  return updated_group;
end;
$$;
grant execute on function public.update_rekber_workflow(uuid, text) to authenticated;
