import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import RoleBadge from "../components/RoleBadge";
import { StarDisplay } from "../components/Stars";
import ProductShareMenu from "../components/ProductShareMenu";
import ImageLightbox from "../components/ImageLightbox";
import { dispatchNativePush } from "../lib/nativePush";

export default function ProductDetail() {
  const { slug } = useParams();
  const { user, signInWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [product, setProduct] = useState(null);
  const [seller, setSeller] = useState(null);
  const [productReviews, setProductReviews] = useState([]);
  const [sellerReviews, setSellerReviews] = useState([]);
  const [activeImg, setActiveImg] = useState(0);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [requestError, setRequestError] = useState("");
  const [wishlisted, setWishlisted] = useState(false);
  const [wishlistCount, setWishlistCount] = useState(0);
  const [soldOutPopup, setSoldOutPopup] = useState(false);
  const [zoomOpen, setZoomOpen] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      const { data: p } = await supabase.from("products").select("*").eq("slug", slug).single();
      if (!active) return;
      setProduct(p);
      if (p?.id) {
        const [{ data: wishlistTotal, error: wishlistCountError }, { data: existingWishlist }] = await Promise.all([
          supabase.rpc("get_product_wishlist_count", { product_uuid: p.id }),
          user ? supabase.from("product_wishlists").select("id").eq("product_id", p.id).eq("user_id", user.id).maybeSingle() : Promise.resolve({ data: null }),
        ]);
        if (wishlistCountError) {
          console.warn("Wishlist count RPC belum tersedia. Jalankan schema_v22.sql di Supabase.", wishlistCountError.message);
        }
        setWishlistCount(Number(wishlistTotal || 0));
        setWishlisted(Boolean(existingWishlist));
      }
      if (p && Number(p.stock ?? 1) <= 0) setSoldOutPopup(true);
      if (p?.id && user && user.id !== p.seller_id) {
        const { data: recorded, error: viewError } = await supabase.rpc("record_product_view", { product_uuid: p.id });
        if (!viewError && recorded && active) {
          setProduct((current) => current ? { ...current, view_count: Number(current.view_count || 0) + 1 } : current);
        }
      }
      if (p?.seller_id) {
        const { data: s } = await supabase.from("profiles").select("*").eq("id", p.seller_id).single();
        setSeller(s);
        const [{ data: productReviewData }, { data: sellerReviewData }] = await Promise.all([
          supabase.from("product_reviews").select("id, rating, comment, created_at, reviewer:buyer_id(display_name, avatar_url)").eq("product_id", p.id).order("created_at", { ascending: false }),
          supabase.from("seller_reviews").select("id, rating, comment, created_at, reviewer:reviewer_id(display_name, avatar_url)").eq("seller_id", p.seller_id).order("created_at", { ascending: false }),
        ]);
        setProductReviews(productReviewData || []);
        setSellerReviews(sellerReviewData || []);
      }
      setLoading(false);
    }
    load();
    return () => { active = false; };
  }, [slug, user?.id]);

  const productAvgRating = productReviews.length
    ? productReviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / productReviews.length
    : 0;
  const sellerAvgRating = sellerReviews.length
    ? sellerReviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / sellerReviews.length
    : 0;

  function openZoom() {
    if (!images.length) return;
    setZoomOpen(true);
  }

  function closeZoom() {
    setZoomOpen(false);
  }

  async function refreshWishlistCount(productId) {
    const { data, error } = await supabase.rpc("get_product_wishlist_count", { product_uuid: productId });
    if (!error) setWishlistCount(Number(data || 0));
  }

  async function toggleWishlist() {
    if (!user) return signInWithGoogle();
    if (!product?.id || user.id === product.seller_id) return;
    if (wishlisted) {
      const { error } = await supabase.from("product_wishlists").delete().eq("product_id", product.id).eq("user_id", user.id);
      if (!error) {
        setWishlisted(false);
        await refreshWishlistCount(product.id);
      }
      return;
    }
    const { error } = await supabase.from("product_wishlists").insert({ product_id: product.id, user_id: user.id });
    if (!error) {
      setWishlisted(true);
      await refreshWishlistCount(product.id);
    }
  }

  async function requestToBuy() {
    if (!user) return signInWithGoogle();
    if (!product?.seller_id || product.seller_id === user.id || Number(product.stock ?? 1) <= 0) {
      if (Number(product?.stock ?? 1) <= 0) setSoldOutPopup(true);
      return;
    }
    setRequesting(true);
    setRequestError("");

    let { data: thread, error: threadError } = await supabase
      .from("chat_threads")
      .select("id")
      .eq("product_id", product.id)
      .or(`user_a.eq.${user.id},user_b.eq.${user.id}`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (threadError) {
      const fallbackThread = await supabase.from("chat_threads").select("id").eq("product_id", product.id).or(`user_a.eq.${user.id},user_b.eq.${user.id}`).limit(1).maybeSingle();
      thread = fallbackThread.data || null;
    }

    if (!thread) {
      const { data: newThread, error: createThreadError } = await supabase
        .from("chat_threads")
        .insert({ user_a: user.id, user_b: product.seller_id, product_id: product.id })
        .select("id")
        .single();
      if (createThreadError || !newThread) {
        setRequesting(false);
        setRequestError(createThreadError?.message || "Chat belum dapat dibuat. Coba lagi.");
        return;
      }
      thread = newThread;
    }

    const { data: firstMessage, error: messageError } = await supabase.from("chat_messages").insert({
      thread_id: thread.id,
      sender_id: user.id,
      content: `Halo, saya mau beli produk "${product.name}".`,
    }).select("id").single();
    if (messageError) {
      setRequesting(false);
      setRequestError(messageError.message || "Pesan pembelian belum dapat dikirim. Coba lagi.");
      return;
    }
    void dispatchNativePush({ event: "chat-message", messageId: firstMessage.id });

    const { data: existingRequest, error: existingRequestError } = await supabase
      .from("purchase_requests")
      .select("id")
      .eq("thread_id", thread.id)
      .eq("buyer_id", user.id)
      .neq("status", "completed")
      .neq("status", "rejected")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingRequestError) {
      console.warn("Tidak dapat memeriksa purchase request aktif:", existingRequestError.message);
    }

    if (!existingRequest) {
      const { error: requestInsertError } = await supabase.from("purchase_requests").insert({
        product_id: product.id,
        buyer_id: user.id,
        seller_id: product.seller_id,
        thread_id: thread.id,
        status: "pending",
      });
      if (requestInsertError) {
        setRequesting(false);
        setRequestError(requestInsertError.message || "Permintaan beli belum dapat disimpan. Coba lagi.");
        return;
      }
    }

    setRequesting(false);
    navigate(`/chat/${thread.id}`);
  }

  if (loading) return <div className="container skeleton" style={{ height: 300, marginTop: 20 }} />;
  if (!product) return <main className="container empty-state"><p>Produk tidak ditemukan.</p></main>;

  const images = product.images?.length ? product.images : product.image_url ? [product.image_url] : [];
  const isOwnProduct = user?.id === product.seller_id;
  const isSoldOut = Number(product.stock ?? 1) <= 0;

  if (isSoldOut && !isOwnProduct) {
    return <main className="container empty-state"><div className="sold-out-modal-card sold-out-public-card"><span className="sold-out-icon">!</span><h3>Item telah habis</h3><p>Produk ini sudah dibeli dan tidak tersedia lagi untuk publik.</p><button type="button" className="btn btn-primary" onClick={() => navigate(-1)}>Kembali</button></div></main>;
  }

  return (
    <>
      <main className="container" style={{ paddingTop: 24, paddingBottom: 40 }}>
      <div className="product-detail-grid">
        <div className="product-detail-media">
          <div
            className="product-detail-main-img"
            role="button"
            tabIndex={0}
            aria-label="Perbesar gambar produk"
            onClick={openZoom}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") openZoom();
            }}
          >
            {images.length ? (
              <img
                src={images[activeImg]}
                alt={product.name}
                draggable={false}
              />
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
                  type="button"
                  key={i}
                  className={"product-detail-thumb" + (i === activeImg ? " active" : "")}
                  onClick={() => setActiveImg(i)}
                  aria-label={`Tampilkan gambar ${i + 1}`}
                >
                  <img
                    src={img}
                    alt=""
                  />
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
            <button type="button" className={`product-like-button ${wishlisted ? "is-liked" : ""}`} onClick={toggleWishlist} aria-label={wishlisted ? "Hapus dari wishlist" : "Tambah ke wishlist"}>
              {wishlisted ? "♥" : "♡"} <span>{wishlistCount}</span>
            </button>
            <span className="product-view-count">{product.view_count || 0} kunjungan</span>
            <ProductShareMenu product={product} />
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
                    <Link to={`/toko/${seller.id}`} style={{ fontSize: 13.5, fontWeight: 800 }}>{seller.display_name}</Link>
                  <RoleBadge profile={seller} />
                </div>
                <span className="product-detail-seller-rating"><small>Rating toko</small> <StarDisplay rating={sellerAvgRating} count={sellerReviews.length} /></span>
                {seller.bio && <p className="seller-bio-snippet">{seller.bio}</p>}
              </div>
            </div>
          )}

          {!isOwnProduct ? (
            <>
              <button className="btn btn-primary btn-full" onClick={requestToBuy} disabled={requesting} style={{ marginTop: 16 }}>
                {requesting ? "Memproses..." : Number(product.stock ?? 1) <= 0 ? "Item telah habis" : "Saya Mau Beli"}
              </button>
              {requestError && <p className="form-error" role="alert" style={{ marginTop: 8 }}>{requestError}</p>}
            </>
          ) : (
            <p style={{ color: "var(--ink-500)", marginTop: 16 }}>{Number(product.stock ?? 1) <= 0 ? "Item ini telah habis dan hanya terlihat di menu produk terjual." : "Ini produk kamu sendiri."}</p>
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

      {soldOutPopup && (
        <div className="sold-out-modal" role="dialog" aria-modal="true">
          <div className="sold-out-modal-card"><span className="sold-out-icon">!</span><h3>Item telah habis</h3><p>Produk ini sudah selesai dibeli dan tidak tersedia untuk pembelian publik.</p><button type="button" className="btn btn-primary btn-full" onClick={() => setSoldOutPopup(false)}>Mengerti</button></div>
        </div>
      )}

      <section style={{ marginTop: 40 }}>
        <h3 style={{ fontSize: 17, marginBottom: 14 }}>
          Penilaian Produk {productReviews.length > 0 && <StarDisplay rating={productAvgRating} count={productReviews.length} />}
        </h3>
        {productReviews.length === 0 ? (
          <p style={{ color: "var(--ink-500)" }}>Belum ada penilaian untuk produk ini.</p>
        ) : (
          <div className="review-list">
            {productReviews.map((r) => (
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
      <ImageLightbox
        src={images[activeImg]}
        alt={product.name}
        open={zoomOpen}
        onClose={closeZoom}
      />
    </>
  );
}
