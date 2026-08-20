import { supabase } from "./supabase";

export const PRODUCT_SORTS = {
  POPULAR: "popular",
  NEWEST: "newest",
  AZ: "az",
  PRICE_LOW: "price-low",
  PRICE_HIGH: "price-high",
  OFFICIAL: "official",
  TOP_SALES: "top-sales",
};

export async function enrichProducts(products = []) {
  const sellerIds = [...new Set(products.map((product) => product.seller_id).filter(Boolean))];
  const productIds = products.map((product) => product.id).filter(Boolean);
  const [sellerResult, reviewResult, tagResult] = await Promise.all([
    sellerIds.length
      ? supabase.from("profiles").select("id, display_name, avatar_url, bio, is_verified, is_owner").in("id", sellerIds)
      : Promise.resolve({ data: [] }),
    sellerIds.length
      ? supabase.from("seller_reviews").select("seller_id, rating").in("seller_id", sellerIds)
      : Promise.resolve({ data: [] }),
    productIds.length
      ? supabase.from("product_game_tags").select("product_id, game_tags(id, name, image_url)").in("product_id", productIds)
      : Promise.resolve({ data: [] }),
  ]);

  const sellerMap = new Map((sellerResult.data || []).map((seller) => [seller.id, seller]));
  const ratingMap = new Map();
  (reviewResult.data || []).forEach((review) => {
    const current = ratingMap.get(review.seller_id) || { total: 0, count: 0 };
    current.total += Number(review.rating) || 0;
    current.count += 1;
    ratingMap.set(review.seller_id, current);
  });
  const tagMap = new Map();
  (tagResult.data || []).forEach((link) => {
    if (!link.game_tags) return;
    const current = tagMap.get(link.product_id) || [];
    current.push(link.game_tags);
    tagMap.set(link.product_id, current);
  });

  return products.map((product) => {
    const ratingData = ratingMap.get(product.seller_id) || { total: 0, count: 0 };
    return {
      ...product,
      seller: sellerMap.get(product.seller_id) || null,
      rating: ratingData.count ? ratingData.total / ratingData.count : 0,
      rating_count: ratingData.count,
      game_tags: tagMap.get(product.id) || [],
    };
  });
}

export function sortProducts(products, sort) {
  const result = [...(products || [])];
  if (sort === PRODUCT_SORTS.NEWEST) {
    return result.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
  }
  if (sort === PRODUCT_SORTS.POPULAR) {
    return result.sort((a, b) => Number(b.like_count || 0) - Number(a.like_count || 0) || Number(b.view_count || 0) - Number(a.view_count || 0));
  }
  if (sort === PRODUCT_SORTS.AZ) {
    return result.sort((a, b) => a.name.localeCompare(b.name, "id", { sensitivity: "base" }));
  }
  if (sort === PRODUCT_SORTS.PRICE_LOW) {
    return result.sort((a, b) => Number(a.price_from || 0) - Number(b.price_from || 0));
  }
  if (sort === PRODUCT_SORTS.PRICE_HIGH) {
    return result.sort((a, b) => Number(b.price_from || 0) - Number(a.price_from || 0));
  }
  if (sort === PRODUCT_SORTS.OFFICIAL) {
    return result
      .filter((product) => product.seller?.is_verified || product.seller?.is_owner)
      .sort((a, b) => Number(b.seller?.is_owner) - Number(a.seller?.is_owner) || Number(b.rating || 0) - Number(a.rating || 0));
  }
  return result.sort(
    (a, b) =>
      Number(b.sales_count || 0) - Number(a.sales_count || 0) ||
      Number(b.rating_count || 0) - Number(a.rating_count || 0) ||
      Number(b.like_count || 0) - Number(a.like_count || 0) ||
      Number(b.view_count || 0) - Number(a.view_count || 0)
  );
}

export function topProducts(products, limit = 5) {
  return sortProducts(products, PRODUCT_SORTS.TOP_SALES).slice(0, limit);
}
