import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";

function getProductImagePaths(product) {
  const urls = [...new Set([...(product.images || []), product.image_url].filter(Boolean))];
  const marker = "/storage/v1/object/public/product-images/";
  return urls
    .filter((url) => url.includes(marker))
    .map((url) => decodeURIComponent(url.split(marker)[1]))
    .filter(Boolean);
}

export default function MyProducts() {
  const { user } = useAuth();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [soldTab, setSoldTab] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [deleteError, setDeleteError] = useState("");
  const [deleteNotice, setDeleteNotice] = useState("");
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (!user) return;
    load();
  }, [user]);

  async function load() {
    setLoadError("");
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("seller_id", user.id)
      .order("created_at", { ascending: false });
    if (error) setLoadError("Produk gagal dimuat. Coba refresh halaman.");
    setProducts(data || []);
    setLoading(false);
  }

  function openDelete(product) {
    setDeleteTarget(product);
    setDeleteError("");
    setDeleteNotice("");
  }

  function closeDelete() {
    if (deletingId) return;
    setDeleteTarget(null);
    setDeleteError("");
  }

  async function archiveProduct(product) {
    const { data, error } = await supabase
      .from("products")
      .update({ is_active: false, stock: 0 })
      .eq("id", product.id)
      .eq("seller_id", user.id)
      .select()
      .single();
    if (error) return { error };
    setProducts((prev) => prev.map((item) => (item.id === product.id ? { ...item, ...(data || {}), is_active: false, stock: 0 } : item)));
    return { error: null };
  }

  async function confirmDelete() {
    if (!deleteTarget || !user) return;
    const product = deleteTarget;
    setDeletingId(product.id);
    setDeleteError("");
    setDeleteNotice("");

    const [{ count: threadCount, error: threadError }, { count: requestCount, error: requestError }] = await Promise.all([
      supabase.from("chat_threads").select("id", { count: "exact", head: true }).eq("product_id", product.id),
      supabase.from("purchase_requests").select("id", { count: "exact", head: true }).eq("product_id", product.id),
    ]);

    if (threadError || requestError) {
      setDeletingId(null);
      setDeleteError("Status riwayat produk gagal diperiksa. Tidak ada perubahan yang dilakukan.");
      return;
    }

    const hasHistory = (threadCount || 0) > 0 || (requestCount || 0) > 0;
    if (hasHistory) {
      const { error } = await archiveProduct(product);
      setDeletingId(null);
      if (error) {
        setDeleteError(error.message || "Produk gagal disembunyikan.");
        return;
      }
      setDeleteTarget(null);
      setSoldTab(true);
      setDeleteNotice("Produk disembunyikan karena sudah memiliki riwayat chat atau transaksi. Riwayat tetap aman di menu Terjual / habis.");
      return;
    }

    const { error: deleteErrorFromDb } = await supabase
      .from("products")
      .delete()
      .eq("id", product.id)
      .eq("seller_id", user.id);

    if (deleteErrorFromDb) {
      // Fallback protects the seller from a failed hard delete caused by a hidden FK/reference.
      const { error: archiveError } = await archiveProduct(product);
      setDeletingId(null);
      if (archiveError) {
        setDeleteError(deleteErrorFromDb.message || "Produk gagal dihapus.");
        return;
      }
      setDeleteTarget(null);
      setSoldTab(true);
      setDeleteNotice("Produk tidak dapat dihapus permanen karena masih direferensikan. Produk sudah disembunyikan dan riwayat tetap aman.");
      return;
    }

    const imagePaths = getProductImagePaths(product);
    if (imagePaths.length) await supabase.storage.from("product-images").remove(imagePaths);
    setProducts((prev) => prev.filter((item) => item.id !== product.id));
    setDeleteTarget(null);
    setDeletingId(null);
    setDeleteNotice("Produk berhasil dihapus.");
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

      {loadError && <p className="product-delete-error" role="alert">{loadError}</p>}
      {deleteNotice && <p className="form-success" role="status">{deleteNotice}</p>}
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
                  Rp{Number(p.price_from).toLocaleString("id-ID")} · {Number(p.stock ?? 1) <= 0 ? "Habis" : p.is_active === false ? <span className="product-inactive-label">Disembunyikan</span> : `Stok ${p.stock ?? 1}`}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <Link to={`/jual/edit/${p.id}`} className="btn btn-outline" style={{ padding: "8px 14px", fontSize: 13 }}>
                  Edit
                </Link>
                <button
                  className="btn btn-outline product-delete-button"
                  style={{ padding: "8px 14px", fontSize: 13 }}
                  onClick={() => openDelete(p)}
                  disabled={deletingId === p.id}
                >
                  Hapus
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {deleteTarget && (
        <div className="direct-action-modal" role="dialog" aria-modal="true" aria-labelledby="delete-product-title">
          <div className="direct-action-modal-card product-delete-modal-card">
            <h3 id="delete-product-title">Hapus produk?</h3>
            <p className="product-delete-warning"><strong>{deleteTarget.name}</strong> akan dihapus jika belum memiliki riwayat chat atau transaksi. Jika sudah direferensikan, produk akan disembunyikan agar riwayat pembelian tetap aman.</p>
            {deleteError && <p className="product-delete-error" role="alert">{deleteError}</p>}
            <div className="direct-action-modal-actions">
              <button type="button" className="btn btn-outline" onClick={closeDelete} disabled={Boolean(deletingId)}>Batal</button>
              <button type="button" className="btn btn-danger" onClick={confirmDelete} disabled={Boolean(deletingId)}>{deletingId ? "Memproses..." : "Hapus produk"}</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
