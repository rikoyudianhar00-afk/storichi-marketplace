import { Link, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { ProductList } from "../components/ProductSection";
import { enrichProducts, topProducts } from "../lib/catalog";
import { supabase } from "../lib/supabase";

export default function GroupPage() {
  const { slug } = useParams();
  const [group, setGroup] = useState(null);
  const [corridors, setCorridors] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      const { data: groupData } = await supabase.from("category_groups").select("*").eq("slug", slug).maybeSingle();
      if (!groupData) {
        if (active) { setGroup(null); setLoading(false); }
        return;
      }
      const { data: categories } = await supabase.from("categories").select("*").eq("group_id", groupData.id).order("sort_order", { ascending: true });
      const slugs = (categories || []).map((category) => category.slug);
      const { data: productData } = slugs.length
        ? await supabase.from("products").select("*").in("category", slugs).eq("is_active", true).gt("stock", 0)
        : { data: [] };
      const enriched = await enrichProducts(productData || []);
      const nextCorridors = (categories || []).map((category) => ({
        ...category,
        products: topProducts(enriched.filter((product) => product.category === category.slug), 5),
      }));
      if (active) {
        setGroup(groupData);
        setCorridors(nextCorridors);
        setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [slug]);

  if (loading) return <main className="container"><div className="skeleton" style={{ height: 180, marginTop: 24 }} /></main>;
  if (!group) return <main className="container empty-state"><p>Grup kategori tidak ditemukan.</p></main>;

  return (
    <main className="container category-corridor-page">
      <div className="corridor-hero">
        <div className="corridor-hero-icon">{group.image_url ? <img src={group.image_url} alt="" /> : <span>{group.label?.[0]}</span>}</div>
        <div><span className="section-kicker">Grup kategori</span><h1 className="page-title">{group.label}</h1><p className="page-subtitle">Kategori yang tergabung dalam grup ini.</p></div>
      </div>
      <div className="corridor-breadcrumb"><Link to="/">Beranda</Link><span>/</span><span>{group.label}</span></div>
      <div className="group-category-chip-list">
        {corridors.map((category) => (
          <Link key={category.id} to={`/kategori/${category.slug}`} className="group-category-chip">
            <span className="group-category-chip-icon">{category.image_url ? <img src={category.image_url} alt="" /> : <span>{category.label?.[0] || "K"}</span>}</span>
            <span>{category.label}</span>
          </Link>
        ))}
      </div>
      {corridors.length === 0 ? (
        <div className="empty-state"><p>Belum ada kategori di dalam grup ini.</p></div>
      ) : corridors.map((category) => (
        <section key={category.id} className="corridor-section">
          <div className="corridor-section-head">
            <div><span className="section-kicker">Kategori</span><h2>{category.label}</h2></div>
            <Link to={`/kategori/${category.slug}`} className="see-all">Lihat semua →</Link>
          </div>
          <ProductList items={category.products} emptyText="Belum ada produk di kategori ini." />
        </section>
      ))}
    </main>
  );
}
