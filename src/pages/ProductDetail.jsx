import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import RoleBadge from "../components/RoleBadge";
import { StarDisplay } from "../components/Stars";

export default function ProductDetail() {
  const { slug } = useParams();
  const { user, signInWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [product, setProduct] = useState(null);
  const [seller, setSeller] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [activeImg, setActiveImg] = useState(0);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);

  useEffect(() => {
    async function load() {
      const { data: p } = await supabase.from("products").select("*").eq("slug", slug).single();
      setProduct(p);
      setLikeCount(p?.like_count || 0);
      if (p?.id) {
        supabase.rpc("increment_product_view", { product_uuid: p.id });
        if (user) {
          const { data: existingLike } = await supabase.from("product_likes").select("id").eq("product_id", p.id).eq("user_id", user.id).maybeSingle();
          setLiked(Boolean(existingLike));
        }
      }
      if (p?.seller_id) {
        const { data: s } = await supabase.from("profiles").select("*").eq("id", p.seller_id).single();
        setSeller(s);
        const { data: r } = await supabase
          .from("seller_reviews")
          .select("id, rating, comment, created_at, reviewer:reviewer_id(display_name, avatar_url)")
          .eq("seller_id", p.seller_id)
          .order("created_at", { ascending: false });
        setReviews(r || []);
      }
      setLoading(false);
    }
    load();
  }, [slug]);

  const avgRating = reviews.length
    ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
    : 0;

  async function toggleLike() {
    if (!user) return signInWithGoogle();
    if (!product?.id) return;
    if (liked) {
      const { error } = await supabase.from("product_likes").delete().eq("product_id", product.id).eq("user_id", user.id);
      if (!error) {
        setLiked(false);
        setLikeCount((count) => Math.max(0, count - 1));
      }
      return;
    }
    const { error } = await supabase.from("product_likes").insert({ product_id: product.id, user_id: user.id });
    if (!error) {
      setLiked(true);
      setLikeCount((count) => count + 1);
    }
  }

  async function requestToBuy() {
    if (!user) return signInWithGoogle();
    if (!product?.seller_id || product.seller_id === user.id) return;
    setRequesting(true);

    let { data: thread } = await supabase
      .from("chat_threads")
      .select("id")
      .eq("product_id", product.id)
      .or(`user_a.eq.${user.id},user_b.eq.${user.id}`)
      .maybeSingle();

    if (!thread) {
      const { data: newThread } = await supabase
        .from("chat_threads")
        .insert({ user_a: user.id, user_b: product.seller_id, product_id: product.id })
        .select()
        .single();
      thread = newThread;
    }

    await supabase.from("chat_messages").insert({
      thread_id: thread.id,
      sender_id: user.id,
      content: `Halo, saya mau beli produk "${product.name}".`,
    });

    await supabase.from("purchase_requests").insert({
      product_id: product.id,
      buyer_id: user.id,
      seller_id: product.seller_id,
      thread_id: thread.id,
      status: "pending",
    });

    setRequesting(false);
    navigate(`/chat/${thread.id}`);
  }

  if (loading) return <div className="container skeleton" style={{ height: 300, marginTop: 20 }} />;
  if (!product) return <main className="container empty-state"><p>Produk tidak ditemukan.</p></main>;

  const images = product.images?.length ? product.images : product.image_url ? [product.image_url] : [];
  const isOwnProduct = user?.id === product.seller_id;

  return (
    <main className="container" style={{ paddingTop: 24, paddingBottom: 40 }}>
      <div className="product-detail-grid">
        <div>
          <div className="product-detail-main-img">
            {images.length ? (
              <img src={images[activeImg]} alt={product.name} />
            ) : (
              <div className="product-card-thumb-fallback" style={{ fontSize: 40 }}>
                {product.name[0]}
              </div>
            )}
          </div>
          {images.length > 1 && (
            <div className="product-detail-thumbs">
              {images.map((img, i) => (
                <button
                  key={i}
                  className={"product-detail-thumb" + (i === activeImg ? " active" : "")}
                  onClick={() => setActiveImg(i)}
                >
                  <img src={img} alt="" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <h1 style={{ fontFamily: "var(--font-display)", marginBottom: 8 }}>{product.name}</h1>

          {product.price_from && (
            <p style={{ fontSize: 22, fontWeight: 800, color: "var(--blue-600)", margin: "0 0 10px" }}>
              Rp{Number(product.price_from).toLocaleString("id-ID")}
            </p>
          )}
          <div className="product-engagement-row">
            <button type="button" className={`product-like-button ${liked ? "is-liked" : ""}`} onClick={toggleLike} aria-label={liked ? "Hapus like" : "Sukai produk"}>
              {liked ? "♥" : "♡"} <span>{likeCount}</span>
            </button>
            <span className="product-view-count">{product.view_count || 0} kunjungan</span>
          </div>

          <p className="thread-item-sub" style={{ marginBottom: 16 }}>
            Stok: <strong>{product.stock ?? 1}</strong>
          </p>

          {seller && (
            <div className="seller-mini-card">
              <div className="account-avatar" style={{ width: 40, height: 40, fontSize: 15 }}>
                {seller.avatar_url ? <img src={seller.avatar_url} alt="" /> : <span>{seller.display_name?.[0]}</span>}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <strong style={{ fontSize: 13.5 }}>{seller.display_name}</strong>
                  <RoleBadge profile={seller} />
                </div>
                <StarDisplay rating={avgRating} count={reviews.length} />
              </div>
            </div>
          )}

          {!isOwnProduct ? (
            <button className="btn btn-primary btn-full" onClick={requestToBuy} disabled={requesting} style={{ marginTop: 16 }}>
              {requesting ? "Memproses..." : "Saya Mau Beli"}
            </button>
          ) : (
            <p style={{ color: "var(--ink-500)", marginTop: 16 }}>Ini produk kamu sendiri.</p>
          )}

          {product.description && (
            <div style={{ marginTop: 24 }}>
              <h3 style={{ fontSize: 15, marginBottom: 8 }}>Deskripsi</h3>
              <p style={{ color: "var(--ink-700)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                {product.description}
              </p>
            </div>
          )}
        </div>
      </div>

      <section style={{ marginTop: 40 }}>
        <h3 style={{ fontSize: 17, marginBottom: 14 }}>
          Penilaian Penjual {reviews.length > 0 && <StarDisplay rating={avgRating} count={reviews.length} />}
        </h3>
        {reviews.length === 0 ? (
          <p style={{ color: "var(--ink-500)" }}>Belum ada penilaian untuk penjual ini.</p>
        ) : (
          <div className="review-list">
            {reviews.map((r) => (
              <div key={r.id} className="review-item">
                <div className="account-avatar" style={{ width: 34, height: 34, fontSize: 13 }}>
                  {r.reviewer?.avatar_url ? (
                    <img src={r.reviewer.avatar_url} alt="" />
                  ) : (
                    <span>{r.reviewer?.display_name?.[0] || "U"}</span>
                  )}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <strong style={{ fontSize: 13.5 }}>{r.reviewer?.display_name}</strong>
                    <StarDisplay rating={r.rating} />
                  </div>
                  {r.comment && <p style={{ fontSize: 13.5, color: "var(--ink-700)", margin: "4px 0 0" }}>{r.comment}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
