-- Storichi Marketplace schema v18
-- Anti-manipulation controls for repeated buyer/seller transactions and ratings.
-- Jalankan setelah schema_v17.sql.

create table if not exists public.account_moderation (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  strike_level smallint not null default 0 check (strike_level between 0 and 3),
  permanently_banned boolean not null default false,
  banned_at timestamptz,
  banned_reason text,
  updated_at timestamptz not null default now()
);

create table if not exists public.moderation_pair_controls (
  pair_low_id uuid not null references public.profiles(id) on delete cascade,
  pair_high_id uuid not null references public.profiles(id) on delete cascade,
  blocked_until timestamptz,
  last_detected_at timestamptz,
  detection_count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (pair_low_id, pair_high_id),
  check (pair_low_id < pair_high_id)
);

create table if not exists public.moderation_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in ('warning', 'temporary_block', 'strike', 'permanent_ban', 'ban_lifted')),
  pair_low_id uuid references public.profiles(id) on delete set null,
  pair_high_id uuid references public.profiles(id) on delete set null,
  user_id uuid references public.profiles(id) on delete set null,
  strike_level smallint,
  transaction_count integer,
  window_started_at timestamptz,
  blocked_until timestamptz,
  reason text not null,
  created_at timestamptz not null default now()
);

create index if not exists moderation_events_created_idx on public.moderation_events(created_at desc);
create index if not exists moderation_events_pair_idx on public.moderation_events(pair_low_id, pair_high_id, created_at desc);
create index if not exists purchase_requests_pair_created_idx on public.purchase_requests(buyer_id, seller_id, created_at desc);

alter table public.account_moderation enable row level security;
alter table public.moderation_pair_controls enable row level security;
alter table public.moderation_events enable row level security;

drop policy if exists "Owner can read account moderation" on public.account_moderation;
create policy "Owner can read account moderation" on public.account_moderation
  for select using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_owner = true));

drop policy if exists "User can read own moderation status" on public.account_moderation;
create policy "User can read own moderation status" on public.account_moderation
  for select using (auth.uid() = user_id);

drop policy if exists "Owner can manage account moderation" on public.account_moderation;
create policy "Owner can manage account moderation" on public.account_moderation
  for all using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_owner = true))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_owner = true));

drop policy if exists "Owner can read moderation pairs" on public.moderation_pair_controls;
create policy "Owner can read moderation pairs" on public.moderation_pair_controls
  for select using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_owner = true));

drop policy if exists "Owner can read moderation events" on public.moderation_events;
create policy "Owner can read moderation events" on public.moderation_events
  for select using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_owner = true));

create or replace function public.storichi_assert_accounts_allowed(p_buyer_id uuid, p_seller_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  low_id uuid;
  high_id uuid;
  buyer_ban boolean;
  seller_ban boolean;
  pair_block timestamptz;
begin
  if p_buyer_id = p_seller_id then
    raise exception 'Transaksi dengan akun sendiri tidak diperbolehkan';
  end if;
  select least(p_buyer_id, p_seller_id), greatest(p_buyer_id, p_seller_id) into low_id, high_id;
  select coalesce(permanently_banned, false) into buyer_ban from public.account_moderation where user_id = p_buyer_id;
  select coalesce(permanently_banned, false) into seller_ban from public.account_moderation where user_id = p_seller_id;
  if buyer_ban or seller_ban then
    raise exception 'Transaksi dihentikan: salah satu akun masuk daftar banned permanen oleh Owner';
  end if;
  select blocked_until into pair_block from public.moderation_pair_controls where pair_low_id = low_id and pair_high_id = high_id;
  if pair_block is not null and pair_block > now() then
    raise exception 'Transaksi dengan pasangan ini dibatasi selama 6 jam karena pola transaksi berulang yang mencurigakan. Jangan melanjutkan transaksi dengan pasangan yang sama sampai masa pembatasan selesai.';
  end if;
end;
$$;

grant execute on function public.storichi_assert_accounts_allowed(uuid, uuid) to authenticated;

drop function if exists public.choose_direct_purchase(uuid);
create function public.choose_direct_purchase(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare req public.purchase_requests%rowtype;
begin
  select * into req from public.purchase_requests where id = p_request_id;
  if req.id is null or req.status <> 'approved' then raise exception 'Permintaan belum disetujui'; end if;
  if auth.uid() is distinct from req.buyer_id and auth.uid() is distinct from req.seller_id then raise exception 'Tidak berwenang'; end if;
  perform public.storichi_assert_accounts_allowed(req.buyer_id, req.seller_id);
  update public.purchase_requests set purchase_mode = 'direct' where id = p_request_id;
end;
$$;

grant execute on function public.choose_direct_purchase(uuid) to authenticated;

drop function if exists public.storichi_record_completed_pair(uuid);
create function public.storichi_record_completed_pair(p_request_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  req public.purchase_requests%rowtype;
  low_id uuid;
  high_id uuid;
  window_start timestamptz := now() - interval '30 minutes';
  pair_count integer;
  current_strike integer;
  next_strike integer;
  block_until timestamptz := now() + interval '6 hours';
  violation_reason text := 'Lebih dari 5 transaksi antara pembeli dan penjual yang sama dalam 30 menit. Pola ini dilarang karena dapat digunakan untuk memanipulasi rating atau aktivitas marketplace.';
  notice text;
begin
  select * into req from public.purchase_requests where id = p_request_id;
  if req.id is null then return null; end if;
  select least(req.buyer_id, req.seller_id), greatest(req.buyer_id, req.seller_id) into low_id, high_id;

  select count(*) into pair_count
  from public.purchase_requests
  where buyer_id = req.buyer_id
    and seller_id = req.seller_id
    and status = 'completed'
    and completed_at >= window_start;

  if pair_count <= 5 then return null; end if;

  select greatest(
    coalesce((select strike_level from public.account_moderation where user_id = req.buyer_id), 0),
    coalesce((select strike_level from public.account_moderation where user_id = req.seller_id), 0)
  ) into current_strike;
  next_strike := case when current_strike = 0 then 1 else least(current_strike + 1, 3) end;

  insert into public.moderation_pair_controls(pair_low_id, pair_high_id, blocked_until, last_detected_at, detection_count, updated_at)
  values (low_id, high_id, block_until, now(), 1, now())
  on conflict (pair_low_id, pair_high_id) do update set
    blocked_until = block_until,
    last_detected_at = now(),
    detection_count = public.moderation_pair_controls.detection_count + 1,
    updated_at = now();

  insert into public.account_moderation(user_id, strike_level, permanently_banned, banned_at, banned_reason, updated_at)
  values
    (req.buyer_id, next_strike, next_strike >= 3, case when next_strike >= 3 then now() else null end, case when next_strike >= 3 then violation_reason else null end, now()),
    (req.seller_id, next_strike, next_strike >= 3, case when next_strike >= 3 then now() else null end, case when next_strike >= 3 then violation_reason else null end, now())
  on conflict (user_id) do update set
    strike_level = greatest(public.account_moderation.strike_level, excluded.strike_level),
    permanently_banned = public.account_moderation.permanently_banned or excluded.permanently_banned,
    banned_at = case when excluded.permanently_banned then coalesce(public.account_moderation.banned_at, excluded.banned_at) else public.account_moderation.banned_at end,
    banned_reason = case when excluded.permanently_banned then excluded.banned_reason else public.account_moderation.banned_reason end,
    updated_at = now();

  insert into public.moderation_events(event_type, pair_low_id, pair_high_id, user_id, strike_level, transaction_count, window_started_at, blocked_until, reason)
  select case when next_strike = 1 then 'warning' when next_strike = 2 then 'strike' else 'permanent_ban' end,
    low_id, high_id, account_id, next_strike, pair_count, window_start, block_until, violation_reason
  from (values (req.buyer_id), (req.seller_id)) as accounts(account_id);

  if next_strike = 1 then
    notice := format('PERINGATAN KERAS: terdeteksi lebih dari 5 transaksi dengan pasangan yang sama dalam 30 menit. Transaksi dengan pasangan ini dibatasi selama 6 jam. Pola manipulasi rating atau program ilegal melanggar ketentuan Storichi.', pair_count);
  elsif next_strike = 2 then
    notice := 'SP 2: pola transaksi berulang dengan pasangan yang sama kembali terdeteksi setelah pembatasan 6 jam. Jangan mengulangi pelanggaran ini.';
  else
    notice := 'SP 3: pola pelanggaran berulang terdeteksi. Akun pembeli dan penjual dimasukkan ke daftar banned permanen. Owner dapat meninjau dan mencabut ban secara manual.';
  end if;

  if req.thread_id is not null then
    insert into public.chat_messages(thread_id, sender_id, content, attachment_type)
    values (req.thread_id, req.seller_id, notice, 'system');
  end if;
  return notice;
end;
$$;

grant execute on function public.storichi_record_completed_pair(uuid) to authenticated;

drop function if exists public.complete_direct_purchase(uuid, numeric);
create function public.complete_direct_purchase(p_request_id uuid, p_final_price numeric)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  req public.purchase_requests%rowtype;
  moderation_notice text;
begin
  if p_final_price is null or p_final_price <= 0 then
    raise exception 'Harga final harus lebih besar dari nol';
  end if;
  select * into req from public.purchase_requests where id = p_request_id;
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
  update public.purchase_requests
  set status = 'completed', final_price = p_final_price, seller_done_at = now(), completed_at = now()
  where id = p_request_id;
  select public.storichi_record_completed_pair(p_request_id) into moderation_notice;
  return moderation_notice;
end;
$$;

grant execute on function public.complete_direct_purchase(uuid, numeric) to authenticated;

create or replace function public.lift_storichi_permanent_ban(p_user_id uuid, p_reason text default 'Banned permanen dicabut Owner')
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_owner = true) then
    raise exception 'Hanya Owner yang dapat mencabut banned permanen';
  end if;
  update public.account_moderation
  set permanently_banned = false, banned_at = null, banned_reason = null, updated_at = now()
  where user_id = p_user_id;
  insert into public.moderation_events(event_type, user_id, reason)
  values ('ban_lifted', p_user_id, nullif(trim(p_reason), ''));
end;
$$;

grant execute on function public.lift_storichi_permanent_ban(uuid, text) to authenticated;
