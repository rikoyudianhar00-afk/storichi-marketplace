create table if not exists public.mobile_device_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  code_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists mobile_device_links_lookup_idx
  on public.mobile_device_links (code_hash, expires_at)
  where used_at is null;

alter table public.mobile_device_links enable row level security;
revoke all on public.mobile_device_links from anon, authenticated;

create or replace function public.claim_mobile_device_link(p_code_hash text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  update public.mobile_device_links
  set used_at = now()
  where code_hash = p_code_hash
    and used_at is null
    and expires_at > now()
  returning user_id into v_user_id;

  return v_user_id;
end;
$$;

revoke all on function public.claim_mobile_device_link(text) from public, anon, authenticated;
grant execute on function public.claim_mobile_device_link(text) to service_role;
