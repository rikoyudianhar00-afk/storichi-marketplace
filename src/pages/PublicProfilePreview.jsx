import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import RoleBadge from "../components/RoleBadge";
import { StarDisplay } from "../components/Stars";
import { ProductList } from "../components/ProductSection";
import { enrichProducts } from "../lib/catalog";
import { supabase } from "../lib/supabase";

export default function PublicProfilePreview() {
  const { userId } = useParams();
  const [profile, setProfile] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [midmanReviews, setMidmanReviews] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      const [{ data: profileData }, { data: reviewData }, { data: productData }, { data: midmanReviewData }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
        supabase.from("seller_reviews").select("id, rating, created_at, reviewer:reviewer_id(display_name, avatar_url)").eq("seller_id", userId).order("created_at", { ascending: false }),
        supabase.from("products").select("*").eq("seller_id", userId).eq("is_active", true).gt("stock", 0).order("created_at", { ascending: false }).limit(6),
        supabase.from("rekber_third_party_reviews").select("id, rating, created_at").eq("third_party_id", userId).order("created_at", { ascending: false }),
      ]);
      const nextProducts = await enrichProducts(productData || []);
      if (active) {
        setProfile(profileData);
        setReviews(reviewData || []);
        setMidmanReviews(midmanReviewData || []);
        setProducts(nextProducts);
        setLoading(false);
      }
    }
    if (userId) load();
    const channel = userId ? supabase.channel(`profile-preview-live-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "seller_reviews", filter: `seller_id=eq.${userId}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "rekber_third_party_reviews", filter: `third_party_id=eq.${userId}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "products", filter: `seller_id=eq.${userId}` }, load)
      .subscribe() : null;
    return () => { active = false; if (channel) supabase.removeChannel(channel); };
  }, [userId]);

  if (loading) return <main className="container"><div className="skeleton public-profile-preview-skeleton" /></main>;
  if (!profile) return <main className="container empty-state"><p>Profil tidak ditemukan.</p></main>;

  const rating = reviews.length ? reviews.reduce((total, review) => total + Number(review.rating || 0), 0) / reviews.length : 0;
  const isSeller = products.length > 0 || profile.is_seller;

  return (
    <main className="container public-profile-preview-page">
      <div className="public-profile-preview-card">
        <div className="public-profile-preview-avatar">{profile.avatar_url ? <img src={profile.avatar_url} alt="" /> : <span>{profile.display_name?.[0] || "U"}</span>}</div>
        <div className="public-profile-preview-copy"><div className="shop-name-row"><h1>{profile.display_name || "Pengguna"}</h1><RoleBadge profile={profile} /></div><p>{profile.bio || "Belum ada bio pengguna."}</p><span>{isSeller ? `${products.length} produk aktif` : "Pengguna Storichi"}</span></div>
        {isSeller && <Link to={`/toko/${profile.id}`} className="btn btn-primary">Buka toko</Link>}
      </div>

      {isSeller && <section className="public-profile-rating"><div><span className="section-kicker">Rating toko</span><h2>{rating ? rating.toFixed(1) : "Belum ada"} <span>/ 5</span></h2></div><div><StarDisplay rating={rating} count={reviews.length} /><small>{reviews.length ? `${reviews.length} ulasan` : "Belum ada ulasan"}</small></div></section>}
      {midmanReviews.length > 0 && <section className="public-profile-rating public-profile-midman-rating"><div><span className="section-kicker">Rating Midman (MM)</span><h2>{(midmanReviews.reduce((total, review) => total + Number(review.rating || 0), 0) / midmanReviews.length).toFixed(1)} <span>/ 5</span></h2></div><div><StarDisplay rating={midmanReviews.reduce((total, review) => total + Number(review.rating || 0), 0) / midmanReviews.length} count={midmanReviews.length} /><small>{midmanReviews.length} penilaian sebagai Midman (MM)</small></div></section>}
      {isSeller && <section className="public-profile-products"><div className="shop-toolbar"><div><h2>Pratinjau produk</h2><span>Produk aktif yang terlihat publik</span></div><Link to={`/toko/${profile.id}`} className="see-all">Lihat toko →</Link></div><ProductList items={products} emptyText="Belum ada produk aktif." /></section>}
      {!isSeller && <div className="empty-state public-profile-empty"><p>Profil ini belum memiliki toko publik.</p></div>}
    </main>
  );
}
