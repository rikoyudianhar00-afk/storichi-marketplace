import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import { enrichProducts, PRODUCT_SORTS, sortProducts } from "../lib/catalog";
import { ProductList } from "../components/ProductSection";
import RoleBadge from "../components/RoleBadge";
import SearchBar from "../components/SearchBar";
import { StarDisplay } from "../components/Stars";

export default function ShopPage() {
  const { sellerId } = useParams();
  const { user, signInWithGoogle } = useAuth();
  const [seller, setSeller] = useState(null);
  const [products, setProducts] = useState([]);
  const [following, setFollowing] = useState(false);
  const [followers, setFollowers] = useState(0);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState("popular");
  const [priceAscending, setPriceAscending] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [sellerReviews, setSellerReviews] = useState([]);

  useEffect(() => {
    let active = true;
    async function load() {
      const [{ data: profile }, { data: rawProducts }, { count: followerCount }, { data: reviewData }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", sellerId).maybeSingle(),
        supabase.from("products").select("*").eq("seller_id", sellerId).eq("is_active", true).gt("stock", 0).order("created_at", { ascending: false }),
        supabase.from("seller_follows").select("follower_id", { count: "exact", head: true }).eq("seller_id", sellerId),
        supabase.from("seller_reviews").select("id, rating, comment, created_at, reviewer:reviewer_id(display_name, avatar_url)").eq("seller_id", sellerId).order("created_at", { ascending: false }),
      ]);
      const nextProducts = await enrichProducts(rawProducts || []);
      let isFollowing = false;
      if (user) {
        const { data } = await supabase.from("seller_follows").select("seller_id").eq("follower_id", user.id).eq("seller_id", sellerId).maybeSingle();
        isFollowing = Boolean(data);
      }
      if (active) { setSeller(profile); setProducts(nextProducts); setFollowers(followerCount || 0); setFollowing(isFollowing); setSellerReviews(reviewData || []); setLoading(false); }
    }
    load();
    return () => { active = false; };
  }, [sellerId, user]);

  const sortedProducts = sortProducts(products, sort === "newest" ? "newest" : sort === "best" ? PRODUCT_SORTS.TOP_SALES : sort === "price" ? (priceAscending ? PRODUCT_SORTS.PRICE_LOW : PRODUCT_SORTS.PRICE_HIGH) : "popular");
  const normalizedSearch = searchTerm.toLocaleLowerCase("id");
  const visibleProducts = sortedProducts.filter((product) => {
    if (!normalizedSearch) return true;
    return [product.name, product.description, product.category, product.game_name]
      .filter(Boolean)
      .some((value) => String(value).toLocaleLowerCase("id").includes(normalizedSearch));
  });

  async function toggleFollow() {
    if (!user) return signInWithGoogle();
    if (following) {
      const { error } = await supabase.from("seller_follows").delete().eq("follower_id", user.id).eq("seller_id", sellerId);
      if (!error) { setFollowing(false); setFollowers((count) => Math.max(0, count - 1)); }
    } else {
      const { error } = await supabase.from("seller_follows").insert({ follower_id: user.id, seller_id: sellerId });
      if (!error) { setFollowing(true); setFollowers((count) => count + 1); }
    }
  }

  if (loading) return <main className="container"><div className="skeleton" style={{ height: 260, marginTop: 24 }} /></main>;
  if (!seller) return <main className="container empty-state"><p>Toko tidak ditemukan.</p></main>;
  const sellerRating = sellerReviews.length ? sellerReviews.reduce((total, review) => total + Number(review.rating || 0), 0) / sellerReviews.length : 0;

  return (
    <main className="container shop-page">
      <div className="shop-top-header">
        <SearchBar initialValue={searchTerm} onSearch={setSearchTerm} placeholder="Cari di Toko" className="shop-search-bar" />
        <section className="shop-hero">
          <div className="account-avatar shop-avatar">{seller.avatar_url ? <img src={seller.avatar_url} alt="" /> : <span>{seller.display_name?.[0] || "S"}</span>}</div>
          <div className="shop-identity"><div className="shop-name-row"><h1>{seller.display_name}</h1><RoleBadge profile={seller} /></div><p>{seller.bio || "Selamat datang di toko saya."}</p><span>{followers} pengikut · {products.length} produk</span><Link to={`/pengguna/${seller.id}`} className="shop-profile-preview-link">Pratinjau profil</Link></div>
          <button type="button" className={`btn ${following ? "btn-outline" : "btn-primary"}`} onClick={toggleFollow}>{following ? "Mengikuti" : "Ikuti toko"}</button>
        </section>
      </div>
      <section className="shop-rating-card" aria-labelledby="shop-rating-title"><div><span className="section-kicker">Rating toko</span><h2 id="shop-rating-title">{sellerRating ? sellerRating.toFixed(1) : "Belum ada"} <span>/ 5</span></h2></div><div><StarDisplay rating={sellerRating} count={sellerReviews.length} /><p>{sellerReviews.length ? `${sellerReviews.length} ulasan pembeli` : "Belum ada ulasan toko"}</p></div></section>
      {sellerReviews.length > 0 && <section className="shop-review-list" aria-label="Ulasan toko"><h2>Ulasan terbaru</h2>{sellerReviews.slice(0, 5).map((review) => <article className="shop-review-item" key={review.id}><div className="shop-review-item-head"><strong>{review.reviewer?.display_name || "Pembeli"}</strong><StarDisplay rating={review.rating} /></div>{review.comment && <p>{review.comment}</p>}</article>)}</section>}
      <div className="shop-toolbar"><div><h2>Produk toko</h2><span>{searchTerm ? `${visibleProducts.length} produk cocok dengan “${searchTerm}”` : "Temukan item pilihan seller"}</span></div></div>
      <div className="shop-sort-tabs" role="tablist" aria-label="Urutkan produk toko">
        <button type="button" className={sort === "popular" ? "is-active" : ""} onClick={() => setSort("popular")}>Populer</button>
        <button type="button" className={sort === "newest" ? "is-active" : ""} onClick={() => setSort("newest")}>Terbaru</button>
        <button type="button" className={sort === "best" ? "is-active" : ""} onClick={() => setSort("best")}>Terlaris</button>
        <button type="button" className={sort === "price" ? "is-active" : ""} onClick={() => { setSort("price"); setPriceAscending((value) => !value); }}>Harga {sort === "price" ? (priceAscending ? "↑" : "↓") : "↕"}</button>
      </div>
      <ProductList items={visibleProducts} emptyText={searchTerm ? "Tidak ada produk toko yang cocok dengan pencarian." : "Seller ini belum memiliki produk aktif."} />
    </main>
  );
}
