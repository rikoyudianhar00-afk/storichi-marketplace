import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";

export default function MyProducts() {
  const { user } = useAuth();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [soldTab, setSoldTab] = useState(false);

  useEffect(() => {
    if (!user) return;
    load();
  }, [user]);

  async function load() {
    const { data } = await supabase
      .from("products")
      .select("*")
      .eq("seller_id", user.id)
      .order("created_at", { ascending: false });
    setProducts(data || []);
    setLoading(false);
  }

  async function handleDelete(id) {
    if (!confirm("Hapus produk ini?")) return;
    await supabase.from("products").delete().eq("id", id);
    setProducts((prev) => prev.filter((p) => p.id !== id));
  }

  if (!user) {
    return (
      <main className="container empty-state">
        <h2>Masuk untuk mengelola produk</h2>
      </main>
    );
  }

  const soldProducts = products.filter((product) => Number(product.stock ?? 1) <= 0 || product.is_active === false);
  const activeProducts = products.filter((product) => !soldProducts.some((sold) => sold.id === product.id));
  const visibleProducts = soldTab ? soldProducts : activeProducts;

  return (
    <main className="container">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1 className="page-title">Produk Saya</h1>
        <Link to="/jual/baru" className="btn btn-primary">
          + Jual Produk
        </Link>
      </div>

      <div className="product-inventory-tabs" role="tablist" aria-label="Produk aktif dan terjual"><button type="button" className={!soldTab ? "is-active" : ""} onClick={() => setSoldTab(false)}>Produk aktif ({activeProducts.length})</button><button type="button" className={soldTab ? "is-active" : ""} onClick={() => setSoldTab(true)}>Terjual / habis ({soldProducts.length})</button></div>
      {loading ? (
        <div className="skeleton" style={{ height: 160 }} />
      ) : products.length === 0 ? (
        <div className="empty-state">
          <p>Kamu belum menjual produk apapun.</p>
        </div>
      ) : !visibleProducts.length ? (
        <div className="empty-state"><p>{soldTab ? "Belum ada produk terjual atau habis." : "Tidak ada produk aktif saat ini."}</p></div>
      ) : (
        <div className="thread-list">
          {visibleProducts.map((p) => (
            <div key={p.id} className="thread-item">
              <div className="thread-item-avatar" style={{ overflow: "hidden" }}>
                {p.image_url ? <img src={p.image_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : "📦"}
              </div>
              <div style={{ flex: 1 }}>
                <div className="thread-item-title">{p.name}</div>
                <div className="thread-item-sub">
                  Rp{Number(p.price_from).toLocaleString("id-ID")} · {Number(p.stock ?? 1) <= 0 ? "Habis" : `Stok ${p.stock ?? 1}`}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <Link to={`/jual/edit/${p.id}`} className="btn btn-outline" style={{ padding: "8px 14px", fontSize: 13 }}>
                  Edit
                </Link>
                <button
                  className="btn btn-outline"
                  style={{ padding: "8px 14px", fontSize: 13, color: "var(--accent-coral)", borderColor: "var(--accent-coral)" }}
                  onClick={() => handleDelete(p.id)}
                >
                  Hapus
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
