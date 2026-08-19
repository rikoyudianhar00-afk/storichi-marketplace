-- ============================================================
-- STORICHI MARKETPLACE — Schema v3
-- Ganti sistem role tunggal jadi tag independen (bisa double role)
-- ============================================================

-- Tambah kolom tag baru
alter table profiles add column if not exists is_verified boolean not null default false;
alter table profiles add column if not exists is_midman boolean not null default false;
alter table profiles add column if not exists is_owner boolean not null default false;

-- is_seller dihitung otomatis: true kalau punya minimal 1 produk aktif
-- Kita simpan sebagai kolom agar gampang di-query dari frontend, di-update via trigger
alter table profiles add column if not exists is_seller boolean not null default false;

-- Trigger: update is_seller profil setiap kali produk ditambah/dihapus
create or replace function refresh_seller_status()
returns trigger as $$
declare
  target_seller uuid;
begin
  target_seller := coalesce(new.seller_id, old.seller_id);
  update profiles
  set is_seller = exists (select 1 from products where seller_id = target_seller)
  where id = target_seller;
  return coalesce(new, old);
end;
$$ language plpgsql;

drop trigger if exists trg_refresh_seller_status on products;
create trigger trg_refresh_seller_status
  after insert or delete on products
  for each row execute function refresh_seller_status();

-- Owner otomatis dari hardcoded email (pakai fungsi is_owner_email yang sudah ada dari v2)
create or replace function set_owner_flag()
returns trigger as $$
begin
  if is_owner_email(new.email) then
    new.is_owner := true;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_set_owner_flag on profiles;
create trigger trg_set_owner_flag
  before insert or update on profiles
  for each row execute function set_owner_flag();

-- Policy: owner bisa update is_verified & is_midman siapa saja
drop policy if exists "Owner bisa ubah tag siapa saja" on profiles;
create policy "Owner bisa ubah tag siapa saja" on profiles
  for update using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.is_owner = true)
  );

-- Backfill: set is_seller untuk profile yang sudah punya produk sebelumnya
update profiles set is_seller = true
where id in (select distinct seller_id from products where seller_id is not null);

-- Backfill: pastikan owner email yang sudah pernah login langsung ke-set is_owner
update profiles set is_owner = true where is_owner_email(email);
