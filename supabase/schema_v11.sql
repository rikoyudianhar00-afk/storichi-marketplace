-- STORICHI MARKETPLACE — Schema v11
-- Perbaikan RPC PIN banner: pgcrypto Supabase berada pada schema extensions.
-- Jalankan setelah schema_v9.sql pada Supabase SQL Editor.
-- ============================================================

create extension if not exists pgcrypto;

create or replace function public.save_owner_ad_banner(
  p_pin text,
  p_banner_id uuid,
  p_title text,
  p_image_url text,
  p_target_url text,
  p_alt_text text default '',
  p_display_order integer default 0,
  p_is_active boolean default true
) returns public.ad_banners
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_owner boolean;
  v_pin_hash text;
  v_result public.ad_banners;
begin
  select is_owner into v_owner from public.profiles where id = auth.uid();
  if coalesce(v_owner, false) is not true then
    raise exception 'Hanya Owner yang dapat mengelola iklan';
  end if;
  if p_pin is null or p_pin !~ '^[0-9]{4,8}$' then
    raise exception 'PIN harus terdiri dari 4 sampai 8 angka';
  end if;
  if nullif(trim(p_image_url), '') is null or nullif(trim(p_target_url), '') is null then
    raise exception 'Gambar dan link iklan wajib diisi';
  end if;

  select pin_hash into v_pin_hash from public.owner_pin_settings where owner_id = auth.uid();
  if v_pin_hash is null then
    insert into public.owner_pin_settings(owner_id, pin_hash)
    values (auth.uid(), extensions.crypt(p_pin, extensions.gen_salt('bf')));
  elsif extensions.crypt(p_pin, v_pin_hash) <> v_pin_hash then
    raise exception 'PIN Owner salah';
  end if;

  if p_banner_id is null then
    insert into public.ad_banners(created_by, title, image_url, target_url, alt_text, display_order, is_active)
    values (auth.uid(), left(coalesce(p_title, ''), 160), trim(p_image_url), trim(p_target_url), left(coalesce(p_alt_text, ''), 240), p_display_order, p_is_active)
    returning * into v_result;
  else
    update public.ad_banners
      set title = left(coalesce(p_title, ''), 160), image_url = trim(p_image_url), target_url = trim(p_target_url),
          alt_text = left(coalesce(p_alt_text, ''), 240), display_order = p_display_order, is_active = p_is_active,
          updated_at = now()
    where id = p_banner_id and created_by = auth.uid()
    returning * into v_result;
    if v_result.id is null then
      raise exception 'Banner tidak ditemukan atau bukan milik Owner';
    end if;
  end if;
  return v_result;
end;
$$;

grant execute on function public.save_owner_ad_banner(text, uuid, text, text, text, text, integer, boolean) to authenticated;

create or replace function public.delete_owner_ad_banner(p_pin text, p_banner_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_pin_hash text;
  v_owner boolean;
begin
  select is_owner into v_owner from public.profiles where id = auth.uid();
  if coalesce(v_owner, false) is not true then
    raise exception 'Hanya Owner yang dapat mengelola iklan';
  end if;
  select pin_hash into v_pin_hash from public.owner_pin_settings where owner_id = auth.uid();
  if v_pin_hash is null or extensions.crypt(p_pin, v_pin_hash) <> v_pin_hash then
    raise exception 'PIN Owner salah';
  end if;
  delete from public.ad_banners where id = p_banner_id and created_by = auth.uid();
end;
$$;

grant execute on function public.delete_owner_ad_banner(text, uuid) to authenticated;
