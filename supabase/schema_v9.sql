-- STORICHI MARKETPLACE — Schema v9
-- Banner iklan Owner + PIN, follow seller, dan akses storage banner
-- Jalankan setelah schema_v8.sql
-- ============================================================

create extension if not exists pgcrypto;

create table if not exists owner_pin_settings (
  owner_id uuid primary key references profiles(id) on delete cascade,
  pin_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table owner_pin_settings enable row level security;
drop policy if exists "Owner dapat melihat pengaturan PIN sendiri" on owner_pin_settings;
create policy "Owner dapat melihat pengaturan PIN sendiri" on owner_pin_settings
  for select using (auth.uid() = owner_id and exists (select 1 from profiles p where p.id = auth.uid() and p.is_owner = true));

create table if not exists ad_banners (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  image_url text not null,
  target_url text not null,
  alt_text text not null default '',
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_by uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table ad_banners enable row level security;
drop policy if exists "Banner aktif dapat dilihat publik" on ad_banners;
create policy "Banner aktif dapat dilihat publik" on ad_banners
  for select using (is_active = true or (auth.uid() = created_by and exists (select 1 from profiles p where p.id = auth.uid() and p.is_owner = true)));
drop policy if exists "Owner dapat melihat semua banner" on ad_banners;
create policy "Owner dapat melihat semua banner" on ad_banners
  for select using (exists (select 1 from profiles p where p.id = auth.uid() and p.is_owner = true));

create index if not exists ad_banners_active_order_idx on ad_banners(is_active, display_order, created_at);

create table if not exists seller_follows (
  follower_id uuid not null references profiles(id) on delete cascade,
  seller_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, seller_id),
  check (follower_id <> seller_id)
);

alter table seller_follows enable row level security;
drop policy if exists "Follow dapat dilihat publik" on seller_follows;
create policy "Follow dapat dilihat publik" on seller_follows
  for select using (true);
drop policy if exists "Pengguna dapat follow seller" on seller_follows;
create policy "Pengguna dapat follow seller" on seller_follows
  for insert with check (auth.uid() = follower_id and follower_id <> seller_id);
drop policy if exists "Pengguna dapat menghapus follow sendiri" on seller_follows;
create policy "Pengguna dapat menghapus follow sendiri" on seller_follows
  for delete using (auth.uid() = follower_id);

create index if not exists seller_follows_seller_idx on seller_follows(seller_id);
create index if not exists seller_follows_follower_idx on seller_follows(follower_id);

insert into storage.buckets (id, name, public)
values ('ad-images', 'ad-images', true)
on conflict (id) do update set public = true;

drop policy if exists "Public dapat melihat gambar iklan" on storage.objects;
create policy "Public dapat melihat gambar iklan" on storage.objects
  for select using (bucket_id = 'ad-images');
drop policy if exists "Owner dapat mengunggah gambar iklan" on storage.objects;
create policy "Owner dapat mengunggah gambar iklan" on storage.objects
  for insert with check (
    bucket_id = 'ad-images'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_owner = true)
  );
drop policy if exists "Owner dapat memperbarui gambar iklan" on storage.objects;
create policy "Owner dapat memperbarui gambar iklan" on storage.objects
  for update using (
    bucket_id = 'ad-images'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_owner = true)
  );
drop policy if exists "Owner dapat menghapus gambar iklan" on storage.objects;
create policy "Owner dapat menghapus gambar iklan" on storage.objects
  for delete using (
    bucket_id = 'ad-images'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_owner = true)
  );

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
  select is_owner into v_owner from profiles where id = auth.uid();
  if coalesce(v_owner, false) is not true then raise exception 'Hanya Owner yang dapat mengelola iklan'; end if;
  if p_pin is null or p_pin !~ '^[0-9]{4,8}$' then raise exception 'PIN harus terdiri dari 4 sampai 8 angka'; end if;
  if nullif(trim(p_image_url), '') is null or nullif(trim(p_target_url), '') is null then raise exception 'Gambar dan link iklan wajib diisi'; end if;

  select pin_hash into v_pin_hash from owner_pin_settings where owner_id = auth.uid();
  if v_pin_hash is null then
    insert into owner_pin_settings(owner_id, pin_hash) values (auth.uid(), crypt(p_pin, gen_salt('bf')));
  elsif crypt(p_pin, v_pin_hash) <> v_pin_hash then
    raise exception 'PIN Owner salah';
  end if;

  if p_banner_id is null then
    insert into ad_banners(created_by, title, image_url, target_url, alt_text, display_order, is_active)
    values (auth.uid(), left(coalesce(p_title, ''), 160), trim(p_image_url), trim(p_target_url), left(coalesce(p_alt_text, ''), 240), p_display_order, p_is_active)
    returning * into v_result;
  else
    update ad_banners
      set title = left(coalesce(p_title, ''), 160), image_url = trim(p_image_url), target_url = trim(p_target_url),
          alt_text = left(coalesce(p_alt_text, ''), 240), display_order = p_display_order, is_active = p_is_active,
          updated_at = now()
    where id = p_banner_id and created_by = auth.uid()
    returning * into v_result;
    if v_result.id is null then raise exception 'Banner tidak ditemukan atau bukan milik Owner'; end if;
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
  select is_owner into v_owner from profiles where id = auth.uid();
  if coalesce(v_owner, false) is not true then raise exception 'Hanya Owner yang dapat mengelola iklan'; end if;
  select pin_hash into v_pin_hash from owner_pin_settings where owner_id = auth.uid();
  if v_pin_hash is null or crypt(p_pin, v_pin_hash) <> v_pin_hash then raise exception 'PIN Owner salah'; end if;
  delete from ad_banners where id = p_banner_id and created_by = auth.uid();
end;
$$;

grant execute on function public.delete_owner_ad_banner(text, uuid) to authenticated;
