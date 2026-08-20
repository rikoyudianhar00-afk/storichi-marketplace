-- Storichi Marketplace schema v23
-- Per-user chat archive/delete state with undo support.
-- Jalankan setelah schema_v22.sql.

alter table public.chat_threads
  add column if not exists archived_by_user_a boolean not null default false,
  add column if not exists archived_by_user_b boolean not null default false,
  add column if not exists deleted_by_user_a boolean not null default false,
  add column if not exists deleted_by_user_b boolean not null default false;

create or replace function public.set_chat_thread_state(p_thread_id uuid, p_action text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  changed boolean := false;
begin
  if current_user_id is null then
    return false;
  end if;

  if p_action not in ('archive', 'delete', 'restore') then
    raise exception 'Aksi chat tidak valid';
  end if;

  if exists (select 1 from public.chat_threads where id = p_thread_id and user_a = current_user_id) then
    update public.chat_threads
    set archived_by_user_a = case when p_action = 'archive' then true when p_action = 'restore' then false else archived_by_user_a end,
        deleted_by_user_a = case when p_action = 'delete' then true when p_action = 'restore' then false else deleted_by_user_a end
    where id = p_thread_id;
    changed := true;
  elsif exists (select 1 from public.chat_threads where id = p_thread_id and user_b = current_user_id) then
    update public.chat_threads
    set archived_by_user_b = case when p_action = 'archive' then true when p_action = 'restore' then false else archived_by_user_b end,
        deleted_by_user_b = case when p_action = 'delete' then true when p_action = 'restore' then false else deleted_by_user_b end
    where id = p_thread_id;
    changed := true;
  end if;

  return changed;
end;
$$;

grant execute on function public.set_chat_thread_state(uuid, text) to authenticated;
