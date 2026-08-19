-- STORICHI MARKETPLACE — Schema v7
-- Bio seller, lobby Rekber 3 pihak, workflow custody/status, dan RLS aman
-- Jalankan setelah schema_v6.sql
-- Catatan: workflow ini hanya mencatat konfirmasi antar pihak; belum memindahkan dana/item secara otomatis.
-- ============================================================

-- 1. BIO PROFIL
alter table profiles add column if not exists bio text not null default '';

-- 2. KOLom TRANSAKSI REKBER
alter table rekber_groups add column if not exists purchase_request_id uuid references purchase_requests(id);
alter table rekber_groups add column if not exists buyer_id uuid references profiles(id);
alter table rekber_groups add column if not exists seller_id uuid references profiles(id);
alter table rekber_groups add column if not exists midman_id uuid references profiles(id);
alter table rekber_groups add column if not exists funds_status text not null default 'waiting';
alter table rekber_groups add column if not exists item_status text not null default 'waiting';
alter table rekber_groups add column if not exists workflow_status text not null default 'waiting_for_deposit';
alter table rekber_groups add column if not exists funds_confirmed_at timestamptz;
alter table rekber_groups add column if not exists item_confirmed_at timestamptz;
alter table rekber_groups add column if not exists released_at timestamptz;

-- Normalisasi role lama jika sebelumnya masih memakai member.
update rekber_members m
set role = case
  when m.user_id = g.buyer_id then 'buyer'
  when m.user_id = g.seller_id then 'seller'
  when m.user_id = g.midman_id then 'midman'
  else m.role
end
from rekber_groups g
where g.id = m.group_id
  and g.buyer_id is not null;

-- 3. RPC MEMBUAT LOBBY 3 PIHAK
create or replace function create_rekber_lobby(p_purchase_request_id uuid, p_midman_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  req purchase_requests%rowtype;
  product_name text;
  new_group_id uuid;
  new_code text;
begin
  select * into req
  from purchase_requests
  where id = p_purchase_request_id
    and status = 'approved';

  if req.id is null then
    raise exception 'Permintaan beli belum disetujui atau tidak ditemukan';
  end if;

  if auth.uid() is distinct from req.buyer_id and auth.uid() is distinct from req.seller_id then
    raise exception 'Hanya pembeli atau penjual yang dapat membuat lobby';
  end if;

  if p_midman_id is null or p_midman_id = req.buyer_id or p_midman_id = req.seller_id then
    raise exception 'Midman tidak valid';
  end if;

  if not exists (select 1 from profiles where id = p_midman_id and is_midman = true) then
    raise exception 'Pengguna yang dipilih bukan midman';
  end if;

  select name into product_name from products where id = req.product_id;

  loop
    new_code := 'RB-' || upper(substr(md5(random()::text), 1, 5));
    exit when not exists (select 1 from rekber_groups where code = new_code);
  end loop;

  insert into rekber_groups (
    name, code, created_by, purchase_request_id, buyer_id, seller_id, midman_id,
    status, workflow_status
  ) values (
    'Rekber: ' || coalesce(product_name, 'Transaksi'),
    new_code,
    auth.uid(),
    req.id,
    req.buyer_id,
    req.seller_id,
    p_midman_id,
    'active',
    'waiting_for_deposit'
  ) returning id into new_group_id;

  insert into rekber_members (group_id, user_id, role)
  values
    (new_group_id, req.buyer_id, 'buyer'),
    (new_group_id, req.seller_id, 'seller'),
    (new_group_id, p_midman_id, 'midman');

  update purchase_requests
  set rekber_group_id = new_group_id
  where id = req.id;

  return new_group_id;
end;
$$;

grant execute on function create_rekber_lobby(uuid, uuid) to authenticated;

-- 4. RPC KONFIRMASI STATUS OLEH MIDMAN
create or replace function update_rekber_workflow(p_group_id uuid, p_action text)
returns rekber_groups
language plpgsql
security definer
set search_path = public
as $$
declare
  current_group rekber_groups%rowtype;
  updated_group rekber_groups%rowtype;
  request_product_id uuid;
begin
  select * into current_group from rekber_groups where id = p_group_id and status = 'active';

  if current_group.id is null then
    raise exception 'Lobby Rekber tidak ditemukan atau sudah tidak aktif';
  end if;

  select product_id into request_product_id from purchase_requests where id = current_group.purchase_request_id;

  if auth.uid() is distinct from current_group.midman_id then
    raise exception 'Hanya midman yang dapat mengubah status penitipan dan pelepasan';
  end if;

  if p_action = 'confirm_funds' then
    update rekber_groups
    set funds_status = 'held', funds_confirmed_at = now(), workflow_status = case when item_status = 'held' then 'ready_to_release' else 'waiting_for_item' end
    where id = p_group_id;
  elsif p_action = 'confirm_item' then
    update rekber_groups
    set item_status = 'held', item_confirmed_at = now(), workflow_status = case when funds_status = 'held' then 'ready_to_release' else 'waiting_for_deposit' end
    where id = p_group_id;
  elsif p_action = 'release' then
    if current_group.funds_status <> 'held' or current_group.item_status <> 'held' then
      raise exception 'Dana dan item harus dikonfirmasi dipegang midman sebelum dilepas';
    end if;
    update rekber_groups
    set workflow_status = 'released', status = 'completed', released_at = now()
    where id = p_group_id;
    update purchase_requests
    set status = 'completed'
    where rekber_group_id = p_group_id;
    update products p
    set sales_count = coalesce(p.sales_count, 0) + 1
    where p.id = request_product_id
      and request_product_id is not null;
  else
    raise exception 'Aksi workflow tidak dikenal';
  end if;

  select * into updated_group from rekber_groups where id = p_group_id;
  return updated_group;
end;
$$;

grant execute on function update_rekber_workflow(uuid, text) to authenticated;

-- 5. RLS: peserta lobby dapat membaca/update status; pembuatan anggota dilakukan RPC.
drop policy if exists "Creator bisa update status grup" on rekber_groups;
drop policy if exists "Peserta bisa melihat grup rekber" on rekber_groups;
create policy "Peserta bisa melihat grup rekber" on rekber_groups
  for select using (
    auth.uid() = buyer_id or auth.uid() = seller_id or auth.uid() = midman_id
    or exists (select 1 from rekber_members m where m.group_id = id and m.user_id = auth.uid())
  );

create policy "Peserta bisa update status dasar grup" on rekber_groups
  for update using (auth.uid() = created_by or auth.uid() = midman_id)
  with check (auth.uid() = created_by or auth.uid() = midman_id);

drop policy if exists "User bisa join grup (insert diri sendiri)" on rekber_members;
create policy "Peserta bisa melihat anggota lobby" on rekber_members
  for select using (
    exists (select 1 from rekber_groups g where g.id = group_id and (auth.uid() = g.buyer_id or auth.uid() = g.seller_id or auth.uid() = g.midman_id))
  );

-- 6. Moderasi server-side untuk mencegah bypass validasi browser.
create or replace function reject_unsafe_chat_message()
returns trigger
language plpgsql
as $$
declare
  normalized text;
  blocked text[] := array['anjing','bangsat','bajingan','brengsek','goblok','tolol','kampret','kontol','memek','ngentot','jancuk','lonte','perek','pelacur','fuck','fucker','bitch','dick','pussy','cunt','whore','slut'];
  term text;
begin
  normalized := lower(regexp_replace(coalesce(new.content, ''), '[^a-zA-Z0-9]+', ' ', 'g'));
  foreach term in array blocked loop
    if normalized ~ (concat('(^|\\s)', term, '(\\s|$)')) then
      raise exception 'Pesan mengandung kata yang tidak diperbolehkan';
    end if;
  end loop;
  if coalesce(new.content, '') ~* '(bunuh[[:space:]]+(kamu|lu|elo|dia)|kill[[:space:]]+you|https?://.*(otp|password|seed|phishing))' then
    raise exception 'Pesan berbahaya tidak diperbolehkan';
  end if;
  return new;
end;
$$;

drop trigger if exists reject_unsafe_chat_message_trigger on chat_messages;
create trigger reject_unsafe_chat_message_trigger
before insert or update on chat_messages
for each row execute function reject_unsafe_chat_message();

drop trigger if exists reject_unsafe_rekber_message_trigger on rekber_messages;
create trigger reject_unsafe_rekber_message_trigger
before insert or update on rekber_messages
for each row execute function reject_unsafe_chat_message();

-- 7. Realtime perubahan workflow.
alter publication supabase_realtime add table rekber_groups;
