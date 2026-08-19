import { Link, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import ProductFilters from "../components/ProductFilters";
import { ProductList } from "../components/ProductSection";
import { enrichProducts, PRODUCT_SORTS, sortProducts } from "../lib/catalog";
import { supabase } from "../lib/supabase";

export default function CategoryPage() {
  const { slug } = useParams();
  const [items, setItems] = useState([]);
  const [category, setCategory] = useState(null);
  const [group, setGroup] = useState(null);
  const [sort, setSort] = useState(PRODUCT_SORTS.TOP_SALES);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      const { data: cat } = await supabase.from("categories").select("*").eq("slug", slug).maybeSingle();
      const [{ data: products }, { data: groupData }] = await Promise.all([
        supabase.from("products").select("*").eq("category", slug).eq("is_active", true),
        cat?.group_id ? supabase.from("category_groups").select("*").eq("id", cat.group_id).maybeSingle() : Promise.resolve({ data: null }),
      ]);
      const enriched = await enrichProducts(products || []);
      if (active) {
        setCategory(cat);
        setGroup(groupData);
        setItems(enriched);
        setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [slug]);

  const visibleItems = sortProducts(items, sort);

  return (
    <main className="container category-page">
      <div className="category-page-top">
        <div className="corridor-breadcrumb"><Link to="/">Beranda</Link>{group && <><span>/</span><Link to={`/grup/${group.slug}`}>{group.label}</Link></>}<span>/</span><span>{category?.label || "Kategori"}</span></div>
        <div className="category-heading-row"><div><span className="section-kicker">{group ? "Koridor kategori" : "Kategori mandiri"}</span><h1 className="page-title">{category?.label || "Kategori"}</h1><p className="page-subtitle">Produk terpopuler dan penjual terpercaya di kategori ini.</p></div><ProductFilters value={sort} onChange={setSort} /></div>
      </div>
      <ProductList items={visibleItems} loading={loading} emptyText="Belum ada produk di kategori ini." />
    </main>
  );
}
