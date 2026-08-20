-- Storichi Marketplace schema v22
-- Public wishlist totals without exposing wishlist owner rows.
-- Jalankan setelah schema_v21.sql.

create or replace function public.get_product_wishlist_count(product_uuid uuid)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::bigint
  from public.product_wishlists
  where product_id = product_uuid;
$$;

grant execute on function public.get_product_wishlist_count(uuid) to anon, authenticated;
