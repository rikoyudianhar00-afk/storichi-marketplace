import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";

export default function ProductDetail() {
  const { slug } = useParams();
  const { user, signInWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    supabase
      .from("products")
      .select("*")
      .eq("slug", slug)
      .single()
      .then(({ data }) => {
        setProduct(data);
        setLoading(false);
      });
  }, [slug]);

  async function startChat() {
    if (!user) return signInWithGoogle();
    if (!product?.seller_id || product.seller_id === user.id) return;
    setStarting(true);

    const { data: existing } = await supabase
      .from("chat_threads")
      .select("id")
      .eq("product_id", product.id)
      .or(`user_a.eq.${user.id},user_b.eq.${user.id}`)
      .maybeSingle();

    if (existing) {
      navigate(`/chat/${existing.id}`);
      return;
    }

    const { data: thread } = await supabase
      .from("chat_threads")
      .insert({ user_a: user.id, user_b: product.seller_id, product_id: product.id })
      .select()
      .single();

    setStarting(false);
    if (thread) navigate(`/chat/${thread.id}`);
  }

  if (loading) return <div className="container skeleton" style={{ height: 300, marginTop: 20 }} />;
  if (!product) return <main className="container empty-state"><p>Produk tidak ditemukan.</p></main>;

  return (
    <main className="container" style={{ paddingTop: 24, paddingBottom: 40 }}>
      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 28 }} className="product-detail-grid">
        <div className="product-card-thumb" style={{ maxWidth: 280 }}>
          {product.image_url ? (
            <img src={product.image_url} alt={product.name} />
          ) : (
            <div className="product-card-thumb-fallback" style={{ fontSize: 40 }}>
              {product.name[0]}
            </div>
          )}
        </div>
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", marginBottom: 6 }}>{product.name}</h1>
          {product.price_from && (
            <p style={{ fontSize: 20, fontWeight: 700, color: "var(--blue-600)" }}>
              mulai Rp{Number(product.price_from).toLocaleString("id-ID")}
            </p>
          )}
          <button className="btn btn-primary" onClick={startChat} disabled={starting}>
            {starting ? "Membuka chat..." : "Chat Penjual"}
          </button>
        </div>
      </div>
    </main>
  );
}
