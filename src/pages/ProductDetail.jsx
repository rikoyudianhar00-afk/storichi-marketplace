import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import RoleBadge from "../components/RoleBadge";
import { StarDisplay } from "../components/Stars";
import ProductShareMenu from "../components/ProductShareMenu";

export default function ProductDetail() {
  const { slug } = useParams();
  const { user, signInWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [product, setProduct] = useState(null);
  const [seller, setSeller] = useState(null);
  const [productReviews, setProductReviews] = useState([]);
  const [sellerReviews, setSellerReviews] = useState([]);
  const [activeImg, setActiveImg] = useState(0);
  const [imageRatios, setImageRatios] = useState({});
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [wishlisted, setWishlisted] = useState(false);
  const [wishlistCount, setWishlistCount] = useState(0);
  const [soldOutPopup, setSoldOutPopup] = useState(false);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [zoomScale, setZoomScale] = useState(1);
  const zoomPointersRef = useRef(new Map());
  const pinchStartRef = useRef(null);

  useEffect(() => {
    async function load() {
      const { data: p } = await supabase.from("products").select("*").eq("slug", slug).single();
      setProduct(p);
      if (p?.id) {
        const [{ count: wishlistTotal }, { data: existingWishlist }] = await Promise.all([
          supabase.from("product_wishlists").select("id", { count: "exact", head: true }).eq("product_id", p.id),
          user ? supabase.from("product_wishlists").select("id").eq("product_id", p.id).eq("user_id", user.id).maybeSingle() : Promise.resolve({ data: null }),
        ]);
        setWishlistCount(wishlistTotal || 0);
        setWishlisted(Boolean(existingWishlist));
      }
      if (p && Number(p.stock ?? 1) <= 0) setSoldOutPopup(true);
      if (p?.id && user) {
        supabase.rpc("record_product_view", { product_uuid: p.id });
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
  }, [slug]);

  useEffect(() => {
    if (!zoomOpen) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setZoomOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = "";
    };
  }, [zoomOpen]);

  const productAvgRating = productReviews.length
    ? productReviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / productReviews.length
    : 0;
  const sellerAvgRating = sellerReviews.length
    ? sellerReviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / sellerReviews.length
    : 0;

  function openZoom() {
    if (!images.length) return;
    setZoomScale(1);
    setZoomOpen(true);
  }

  function closeZoom() {
    zoomPointersRef.current.clear();
    pinchStartRef.current = null;
    setZoomOpen(false);
    setZoomScale(1);
  }

  function distanceBetweenPointers() {
    const points = [...zoomPointersRef.current.values()];
    if (points.length < 2) return 0;
    return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
  }

  function handleZoomPointerDown(event) {
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    zoomPointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (zoomPointersRef.current.size === 2) {
      pinchStartRef.current = { distance: distanceBetweenPointers(), scale: zoomScale };
    }
  }

  function handleZoomPointerMove(event) {
    if (!zoomPointersRef.current.has(event.pointerId)) return;
    event.preventDefault();
    zoomPointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (zoomPointersRef.current.size < 2 || !pinchStartRef.current) return;
    const nextDistance = distanceBetweenPointers();
    if (!nextDistance || !pinchStartRef.current.distance) return;
    const nextScale = pinchStartRef.current.scale * (nextDistance / pinchStartRef.current.distance);
    setZoomScale(Math.min(4, Math.max(1, Number(nextScale.toFixed(2)))));
  }

  function handleZoomPointerUp(event) {
    zoomPointersRef.current.delete(event.pointerId);
    if (zoomPointersRef.current.size < 2) pinchStartRef.current = null;
  }

  async function toggleWishlist() {
    if (!user) return signInWithGoogle();
    if (!product?.id) return;
    if (wishlisted) {
      const { error } = await supabase.from("product_wishlists").delete().eq("product_id", product.id).eq("user_id", user.id);
      if (!error) {
        setWishlisted(false);
        setWishlistCount((count) => Math.max(0, count - 1));
      }
      return;
    }
    const { error } = await supabase.from("product_wishlists").insert({ product_id: product.id, user_id: user.id });
    if (!error) {
      setWishlisted(true);
      setWishlistCount((count) => count + 1);
    }
  }

  async function requestToBuy() {
    if (!user) return signInWithGoogle();
    if (!product?.seller_id || product.seller_id === user.id || Number(product.stock ?? 1) <= 0) {
      if (Number(product?.stock ?? 1) <= 0) setSoldOutPopup(true);
      return;
    }
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
  const activeImageRatio = imageRatios[activeImg] || 1;
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
            style={{ aspectRatio: activeImageRatio }}
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
                onLoad={(event) => {
                  const ratio = event.currentTarget.naturalWidth / event.currentTarget.naturalHeight;
                  if (Number.isFinite(ratio) && ratio > 0) setImageRatios((current) => ({ ...current, [activeImg]: ratio }));
                }}
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
                    onLoad={(event) => {
                      const ratio = event.currentTarget.naturalWidth / event.currentTarget.naturalHeight;
                      if (Number.isFinite(ratio) && ratio > 0) setImageRatios((current) => ({ ...current, [i]: ratio }));
                    }}
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
            <button className="btn btn-primary btn-full" onClick={requestToBuy} disabled={requesting} style={{ marginTop: 16 }}>
              {requesting ? "Memproses..." : Number(product.stock ?? 1) <= 0 ? "Item telah habis" : "Saya Mau Beli"}
            </button>
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
      {zoomOpen && (
        <div className="product-image-viewer" role="dialog" aria-modal="true" aria-label="Perbesar gambar produk" onClick={closeZoom}>
          <div className="product-image-viewer-card" onClick={(event) => event.stopPropagation()}>
            <div className="product-image-viewer-toolbar">
              <span>Gambar {activeImg + 1} dari {images.length}</span>
              <div className="product-image-viewer-actions">
                <button type="button" onClick={() => setZoomScale((scale) => Math.max(1, Number((scale - 0.25).toFixed(2))))} aria-label="Perkecil gambar">−</button>
                <button type="button" onClick={() => setZoomScale(1)} aria-label="Reset zoom">{Math.round(zoomScale * 100)}%</button>
                <button type="button" onClick={() => setZoomScale((scale) => Math.min(4, Number((scale + 0.25).toFixed(2))))} aria-label="Perbesar gambar">+</button>
                <button type="button" className="product-image-viewer-close" onClick={closeZoom} aria-label="Tutup gambar">×</button>
              </div>
            </div>
            <div
              className="product-image-viewer-stage"
              onPointerDown={handleZoomPointerDown}
              onPointerMove={handleZoomPointerMove}
              onPointerUp={handleZoomPointerUp}
              onPointerCancel={handleZoomPointerUp}
              onDoubleClick={() => setZoomScale((scale) => (scale > 1 ? 1 : 2))}
            >
              <img
                src={images[activeImg]}
                alt={`${product.name} - gambar ${activeImg + 1}`}
                draggable={false}
                style={{ transform: `scale(${zoomScale})` }}
              />
            </div>
            <p className="product-image-viewer-hint">Cubit dengan dua jari untuk memperbesar atau memperkecil. Ketuk dua kali untuk reset cepat.</p>
          </div>
        </div>
      )}
    </>
  );
}
