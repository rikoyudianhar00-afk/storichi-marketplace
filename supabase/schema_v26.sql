-- Storichi Marketplace schema v26
-- Allow Rekber members to use the original product chat after lobby creation.
-- Jalankan setelah schema_v25.sql.

create or replace function public.storichi_is_rekber_thread_member(p_thread_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.purchase_requests pr
    join public.rekber_groups rg on rg.id = pr.rekber_group_id
    join public.rekber_members rm on rm.group_id = rg.id
    where pr.thread_id = p_thread_id
      and rm.user_id = auth.uid()
      and rg.status in ('active', 'completed')
  );
$$;
grant execute on function public.storichi_is_rekber_thread_member(uuid) to authenticated;

create or replace function public.storichi_is_rekber_request_member(p_request_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.purchase_requests pr
    join public.rekber_groups rg on rg.id = pr.rekber_group_id
    join public.rekber_members rm on rm.group_id = rg.id
    where pr.id = p_request_id
      and rm.user_id = auth.uid()
      and rg.status in ('active', 'completed')
  );
$$;
grant execute on function public.storichi_is_rekber_request_member(uuid) to authenticated;

drop policy if exists "User bisa lihat thread miliknya" on public.chat_threads;
create policy "User bisa lihat thread miliknya atau Rekber" on public.chat_threads
  for select using (auth.uid() = user_a or auth.uid() = user_b or public.storichi_is_rekber_thread_member(id));

drop policy if exists "User bisa baca pesan di thread miliknya" on public.chat_messages;
create policy "User bisa baca pesan miliknya atau Rekber" on public.chat_messages
  for select using (exists (select 1 from public.chat_threads t where t.id = thread_id and (t.user_a = auth.uid() or t.user_b = auth.uid() or public.storichi_is_rekber_thread_member(t.id))));

drop policy if exists "User bisa kirim pesan di thread miliknya" on public.chat_messages;
create policy "User bisa kirim pesan miliknya atau Rekber aktif" on public.chat_messages
  for insert with check (auth.uid() = sender_id and exists (select 1 from public.chat_threads t where t.id = thread_id and (t.user_a = auth.uid() or t.user_b = auth.uid() or public.storichi_is_rekber_thread_member(t.id))));

drop policy if exists "Buyer/seller bisa lihat request miliknya" on public.purchase_requests;
drop policy if exists "Buyer seller atau Rekber member bisa lihat request" on public.purchase_requests;
create policy "Buyer seller atau Rekber member bisa lihat request" on public.purchase_requests
  for select using (auth.uid() = buyer_id or auth.uid() = seller_id or public.storichi_is_rekber_request_member(id));
