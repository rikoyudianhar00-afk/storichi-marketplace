-- Storichi Marketplace schema v28
-- Fix infinite recursion between rekber_groups and rekber_members RLS policies.
-- Jalankan setelah schema_v27.sql.

create or replace function public.storichi_is_rekber_group_participant(p_group_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
set row_security = off
as $$
  select exists (
    select 1 from public.rekber_groups g
    where g.id = p_group_id
      and (g.buyer_id = p_user_id or g.seller_id = p_user_id or g.midman_id = p_user_id or g.third_party_id = p_user_id)
  )
  or exists (
    select 1 from public.rekber_members m
    where m.group_id = p_group_id and m.user_id = p_user_id
  );
$$;
grant execute on function public.storichi_is_rekber_group_participant(uuid, uuid) to authenticated;

create or replace function public.storichi_is_rekber_thread_member(p_thread_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.purchase_requests pr
    join public.rekber_groups rg on rg.id = pr.rekber_group_id
    where pr.thread_id = p_thread_id
      and rg.status in ('active', 'completed')
      and public.storichi_is_rekber_group_participant(rg.id, auth.uid())
  );
$$;
grant execute on function public.storichi_is_rekber_thread_member(uuid) to authenticated;

create or replace function public.storichi_is_rekber_request_member(p_request_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.purchase_requests pr
    join public.rekber_groups rg on rg.id = pr.rekber_group_id
    where pr.id = p_request_id
      and rg.status in ('active', 'completed')
      and public.storichi_is_rekber_group_participant(rg.id, auth.uid())
  );
$$;
grant execute on function public.storichi_is_rekber_request_member(uuid) to authenticated;

-- Break the original cross-table RLS cycle: groups no longer reads members directly,
-- while members calls the SECURITY DEFINER helper instead of groups policy evaluation.
drop policy if exists "Member bisa lihat grup miliknya" on public.rekber_groups;
drop policy if exists "Peserta bisa melihat grup rekber" on public.rekber_groups;
drop policy if exists "Peserta bisa melihat grup rekber tanpa rekursi" on public.rekber_groups;
create policy "Peserta bisa melihat grup rekber tanpa rekursi" on public.rekber_groups
  for select using (
    auth.uid() = buyer_id or auth.uid() = seller_id or auth.uid() = midman_id or auth.uid() = third_party_id
    or public.storichi_is_rekber_group_participant(id, auth.uid())
  );

drop policy if exists "Member bisa lihat daftar member grupnya" on public.rekber_members;
drop policy if exists "Peserta bisa melihat anggota lobby" on public.rekber_members;
drop policy if exists "Peserta bisa melihat anggota lobby tanpa rekursi" on public.rekber_members;
create policy "Peserta bisa melihat anggota lobby tanpa rekursi" on public.rekber_members
  for select using (public.storichi_is_rekber_group_participant(group_id, auth.uid()));

-- Keep request/thread access on the non-recursive helpers.
drop policy if exists "User bisa lihat thread miliknya" on public.chat_threads;
drop policy if exists "User bisa lihat thread miliknya ou Rekber" on public.chat_threads;
drop policy if exists "User bisa lihat thread miliknya ou Rekber tanpa rekursi" on public.chat_threads;
drop policy if exists "User bisa lihat thread miliknya atau Rekber tanpa rekursi" on public.chat_threads;
drop policy if exists "User bisa lihat thread miliknya atau Rekber" on public.chat_threads;
drop policy if exists "User bisa lihat thread miliknya atau Rekber aktif" on public.chat_threads;
create policy "User bisa lihat thread miliknya atau Rekber tanpa rekursi" on public.chat_threads
  for select using (auth.uid() = user_a or auth.uid() = user_b or public.storichi_is_rekber_thread_member(id));

drop policy if exists "User bisa baca pesan di thread miliknya" on public.chat_messages;
drop policy if exists "User bisa baca pesan miliknya atau Rekber" on public.chat_messages;
drop policy if exists "User bisa baca pesan di thread miliknya atau Rekber aktif" on public.chat_messages;
drop policy if exists "Peserta bisa baca chat dan whisper Rekber" on public.chat_messages;
drop policy if exists "Peserta bisa baca chat dan whisper Rekber tanpa rekursi" on public.chat_messages;
create policy "Peserta bisa baca chat dan whisper Rekber tanpa rekursi" on public.chat_messages
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

drop policy if exists "User bisa kirim pesan di thread miliknya" on public.chat_messages;
drop policy if exists "User bisa kirim pesan miliknya atau Rekber aktif" on public.chat_messages;
drop policy if exists "User bisa kirim pesan di thread miliknya atau Rekber aktif" on public.chat_messages;
drop policy if exists "Peserta bisa kirim chat dan whisper Rekber" on public.chat_messages;
drop policy if exists "Peserta bisa kirim chat dan whisper Rekber tanpa rekursi" on public.chat_messages;
create policy "Peserta bisa kirim chat dan whisper Rekber tanpa rekursi" on public.chat_messages
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

drop policy if exists "Buyer seller atau Rekber member bisa lihat request" on public.purchase_requests;
drop policy if exists "Buyer seller atau Rekber member tanpa rekursi" on public.purchase_requests;
create policy "Buyer seller atau Rekber member tanpa rekursi" on public.purchase_requests
  for select using (auth.uid() = buyer_id or auth.uid() = seller_id or public.storichi_is_rekber_request_member(id));
