import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ProductCard } from "../components/ProductSection";
import { supabase } from "../lib/supabase";

export default function CategoryPage() {
  const { slug } = useParams();
  const [items, setItems] = useState([]);
  const [category, setCategory] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      supabase.from("categories").select("*").eq("slug", slug).maybeSingle(),
      supabase.from("products").select("*").eq("category", slug),
    ]).then(([{ data: cat }, { data: products }]) => {
      setCategory(cat);
      setItems(products || []);
      setLoading(false);
    });
  }, [slug]);

  return (
    <main className="container">
      <h1 className="page-title">{category?.label || "Kategori"}</h1>
      {loading ? (
        <div className="product-grid">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ aspectRatio: "1/1" }} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <p>Belum ada produk di kategori ini.</p>
        </div>
      ) : (
        <div className="product-grid">
          {items.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}
    </main>
  );
}
