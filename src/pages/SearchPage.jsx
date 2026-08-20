import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import ProductFilters from "../components/ProductFilters";
import { ProductList } from "../components/ProductSection";
import SearchBar from "../components/SearchBar";
import { enrichProducts, PRODUCT_SORTS, sortProducts } from "../lib/catalog";
import { supabase } from "../lib/supabase";

export default function SearchPage() {
  const [params] = useSearchParams();
  const query = params.get("q")?.trim() || "";
  const [items, setItems] = useState([]);
  const [stores, setStores] = useState([]);
  const [sort, setSort] = useState(PRODUCT_SORTS.TOP_SALES);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!query) {
        setItems([]);
        setStores([]);
        return;
      }
      setLoading(true);
      const safeQuery = query.replace(/[%,()]/g, " ").trim();
      if (!safeQuery) {
        setItems([]);
        setStores([]);
        setLoading(false);
        return;
      }
      const [{ data }, { data: profileMatches }] = await Promise.all([
        supabase
          .from("products")
          .select("*")
          .eq("is_active", true)
          .gt("stock", 0)
          .or(`name.ilike.%${safeQuery}%,description.ilike.%${safeQuery}%,category.ilike.%${safeQuery}%,game_name.ilike.%${safeQuery}%`)
          .limit(50),
        supabase
          .from("profiles")
          .select("id, display_name, avatar_url, bio, is_verified, is_owner, is_seller, is_midman")
          .or(`display_name.ilike.%${safeQuery}%,bio.ilike.%${safeQuery}%`)
          .order("display_name", { ascending: true })
          .limit(50),
      ]);
      const enriched = await enrichProducts(data || []);
      const productSellerIds = (data || []).map((product) => product.seller_id).filter(Boolean);
      const matchedSellerIds = [...new Set([...(profileMatches || []).map((store) => store.id), ...productSellerIds])];
      const { data: productSellerProfiles } = productSellerIds.length
        ? await supabase.from("profiles").select("id, display_name, avatar_url, bio, is_verified, is_owner, is_seller, is_midman").in("id", productSellerIds)
        : { data: [] };
      const storeMap = new Map([...(profileMatches || []), ...(productSellerProfiles || [])].map((store) => [store.id, store]));
      const sellerIds = matchedSellerIds.filter((id) => storeMap.has(id));
      const { data: storeProducts } = sellerIds.length
        ? await supabase.from("products").select("seller_id").in("seller_id", sellerIds).eq("is_active", true).gt("stock", 0)
        : { data: [] };
      const productCounts = (storeProducts || []).reduce((counts, product) => counts.set(product.seller_id, (counts.get(product.seller_id) || 0) + 1), new Map());
      const getPriority = (store) => store.is_owner ? 0 : store.is_verified ? 1 : store.is_midman ? 2 : 3;
      const getRoleLabel = (store) => store.is_owner ? "Owner" : store.is_verified ? "Verified" : store.is_midman ? "Midman" : "Seller";
      const storesWithCounts = sellerIds.map((sellerId) => storeMap.get(sellerId)).map((store) => ({ ...store, productCount: productCounts.get(store.id) || 0, priority: getPriority(store), roleLabel: getRoleLabel(store) })).filter((store) => store.productCount > 0).sort((a, b) => a.priority - b.priority || a.display_name.localeCompare(b.display_name, "id", { sensitivity: "base" }));
      if (active) {
        setItems(enriched);
        setStores(storesWithCounts);
        setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [query]);

  const visibleItems = sortProducts(items, sort);

  return (
    <main className="container search-page">
      <div className="search-page-top">
        <span className="section-kicker">Pencarian marketplace</span>
        <h1 className="page-title">Cari produk</h1>
        <SearchBar initialValue={query} autoFocus={!query} />
      </div>
      {query && <div className="search-result-head"><div><h2>Hasil untuk “{query}”</h2><p>{loading ? "Mencari produk dan toko..." : `${items.length} produk · ${stores.length} toko ditemukan`}</p></div><ProductFilters value={sort} onChange={setSort} /></div>}
      {query && <section className="search-store-section" aria-labelledby="search-store-title"><div className="search-store-heading"><h2 id="search-store-title">Toko</h2><span>{stores.length ? `${stores.length} toko` : ""}</span></div>{stores.length ? <div className="search-store-list">{stores.map((store) => <Link to={`/toko/${store.id}`} className="search-store-card" key={store.id}><span className="search-store-avatar">{store.avatar_url ? <img src={store.avatar_url} alt="" /> : <span>{store.display_name?.[0] || "S"}</span>}</span><span className="search-store-copy"><strong>{store.display_name || "Toko Storichi"}</strong><small>{store.bio || "Lihat produk dan halaman toko"}</small><em>{store.roleLabel} · {store.productCount} produk aktif</em></span><span className="search-store-arrow">→</span></Link>)}</div> : !loading && <p className="search-store-empty">Tidak ada toko yang cocok dengan kata kunci ini.</p>}</section>}
      {query ? <ProductList items={visibleItems} loading={loading} emptyText="Produk tidak ditemukan. Coba kata kunci lain." /> : <div className="empty-state"><p>Masukkan kata kunci untuk mulai mencari.</p></div>}
    </main>
  );
}
