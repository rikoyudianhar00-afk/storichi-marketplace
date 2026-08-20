import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import ProductFilters from "../components/ProductFilters";
import { ProductList } from "../components/ProductSection";
import SearchBar from "../components/SearchBar";
import { enrichProducts, PRODUCT_SORTS, sortProducts } from "../lib/catalog";
import { supabase } from "../lib/supabase";

export default function SearchPage() {
  const [params] = useSearchParams();
  const query = params.get("q")?.trim() || "";
  const [items, setItems] = useState([]);
  const [sort, setSort] = useState(PRODUCT_SORTS.TOP_SALES);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!query) {
        setItems([]);
        return;
      }
      setLoading(true);
      const safeQuery = query.replace(/[%,()]/g, " ").trim();
      const { data } = await supabase
        .from("products")
        .select("*")
        .eq("is_active", true)
        .gt("stock", 0)
        .or(`name.ilike.%${safeQuery}%,description.ilike.%${safeQuery}%`)
        .limit(50);
      const enriched = await enrichProducts(data || []);
      if (active) {
        setItems(enriched);
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
      {query && <div className="search-result-head"><div><h2>Hasil untuk “{query}”</h2><p>{loading ? "Mencari produk..." : `${items.length} produk ditemukan`}</p></div><ProductFilters value={sort} onChange={setSort} /></div>}
      {query ? <ProductList items={visibleItems} loading={loading} emptyText="Produk tidak ditemukan. Coba kata kunci lain." /> : <div className="empty-state"><p>Masukkan kata kunci untuk mulai mencari.</p></div>}
    </main>
  );
}
