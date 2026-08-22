import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import { enrichProducts } from "../lib/catalog";

function isSoldOut(product) {
  return Number(product?.stock ?? 1) <= 0 || product?.is_active === false || Boolean(product?.sold_out_at);
}

export default function Wishlist() {
  const { user, signInWithGoogle } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setItems([]);
      setLoading(false);
      return undefined;
    }
    let active = true;
    async function load() {
      const { data } = await supabase.from("product_wishlists").select("id, product_id, created_at, product:products(*)").eq("user_id", user.id).order("created_at", { ascending: false });
      const rawProducts = (data || []).map((row) => ({ ...row.product, wishlist_id: row.id, wishlist_created_at: row.created_at })).filter((product) => product?.id);
      const enriched = await enrichProducts(rawProducts);
      if (active) {
        setItems(enriched);
        setLoading(false);
        const soldProductIds = enriched.filter(isSoldOut).map((product) => product.id).filter(Boolean);
        if (soldProductIds.length && typeof window !== "undefined") {
          const key = `storichi_wishlist_sold_seen_${user.id}`;
          let seenIds = [];
          try { seenIds = JSON.parse(window.localStorage.getItem(key) || "[]"); } catch { seenIds = []; }
          const nextSeenIds = [...new Set([...(Array.isArray(seenIds) ? seenIds : []), ...soldProductIds])];
          window.localStorage.setItem(key, JSON.stringify(nextSeenIds));
        }
        if (typeof window !== "undefined") window.dispatchEvent(new Event("storichi:wishlist-opened"));
      }
    }
    load();
    const channel = supabase.channel(`wishlist_${user.id}`).on("postgres_changes", { event: "*", schema: "public", table: "product_wishlists", filter: `user_id=eq.${user.id}` }, load).subscribe();
    const productChannel = supabase.channel(`wishlist_products_${user.id}`).on("postgres_changes", { event: "*", schema: "public", table: "products" }, load).subscribe();
    return () => {
      active = false;
      supabase.removeChannel(channel);
      supabase.removeChannel(productChannel);
    };
  }, [user]);

  async function removeWishlist(product) {
    const { error } = await supabase.from("product_wishlists").delete().eq("id", product.wishlist_id).eq("user_id", user.id);
    if (!error) setItems((current) => current.filter((item) => item.wishlist_id !== product.wishlist_id));
  }

  if (!user) {
    return <main className="container empty-state"><h1 className="page-title">Wishlist</h1><p>Masuk untuk menyimpan dan melihat produk wishlist.</p><button type="button" className="btn btn-primary" onClick={signInWithGoogle}>Masuk</button></main>;
  }

  return (
    <main className="container wishlist-page">
      <div className="wishlist-heading"><div><span className="section-kicker">Koleksi tersimpan</span><h1 className="page-title">Wishlist ♡</h1><p>{items.length} produk tersimpan</p></div></div>
      {loading ? <div className="skeleton" style={{ height: 220 }} /> : !items.length ? <div className="empty-state"><p>Belum ada produk di wishlist.</p><Link className="btn btn-primary" to="/">Jelajahi produk</Link></div> : <div className="wishlist-list">{items.map((product) => <article className={`wishlist-item ${isSoldOut(product) ? "is-sold" : ""}`}
 key={product.wishlist_id}><Link to={`/produk/${product.slug}`} className="wishlist-item-main"><div className="wishlist-item-thumb">{product.image_url ? <img src={product.image_url} alt="" /> : <span>{product.name?.[0] || "P"}</span>}{isSoldOut(product) && <span className="sold-ribbon">HABIS</span>}
</div><div className="wishlist-item-copy"><strong>{product.name}</strong><span>{product.category || "Produk digital"}</span><b>Rp{Number(product.price_from || 0).toLocaleString("id-ID")}</b></div></Link><button type="button" className="wishlist-remove" onClick={() => removeWishlist(product)} aria-label={`Hapus ${product.name} dari wishlist`}>♥</button></article>)}</div>}
    </main>
  );
}
