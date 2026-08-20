import { useEffect, useState } from "react";
import CategoryGrid from "../components/CategoryGrid";
import ProductSection from "../components/ProductSection";
import SearchBar from "../components/SearchBar";
import BannerCarousel from "../components/BannerCarousel";
import { useAuth } from "../context/AuthContext";
import { enrichProducts, topProducts } from "../lib/catalog";
import { supabase } from "../lib/supabase";

export default function Home() {
  const [topUp, setTopUp] = useState([]);
  const [akun, setAkun] = useState([]);
  const [trending, setTrending] = useState([]);
  const [discover, setDiscover] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    let active = true;
    async function load() {
      const [{ data: topUpData }, { data: akunData }, { data: trendingData }, { data: follows }] = await Promise.all([
        supabase.from("products").select("*").eq("category", "top-up").eq("is_active", true).limit(8),
        supabase.from("products").select("*").eq("category", "akun").eq("is_active", true).limit(8),
        supabase.from("products").select("*").eq("is_active", true).order("like_count", { ascending: false }).order("view_count", { ascending: false }).limit(10),
        user ? supabase.from("seller_follows").select("seller_id").eq("follower_id", user.id) : Promise.resolve({ data: [] }),
      ]);
      const followedSellerIds = (follows || []).map((follow) => follow.seller_id);
      const { data: followedProducts } = followedSellerIds.length
        ? await supabase.from("products").select("*").in("seller_id", followedSellerIds).eq("is_active", true).order("created_at", { ascending: false }).limit(10)
        : { data: [] };
      const [topUpProducts, akunProducts, trendingProducts, discoverProducts] = await Promise.all([
        enrichProducts(topUpData || []),
        enrichProducts(akunData || []),
        enrichProducts(trendingData || []),
        enrichProducts(followedProducts || []),
      ]);
      if (!active) return;
      setTopUp(topUpProducts);
      setAkun(akunProducts);
      setTrending(topProducts(trendingProducts, 10));
      setDiscover(discoverProducts.length ? discoverProducts : topProducts(trendingProducts, 10));
      setLoading(false);
    }
    load();
    return () => { active = false; };
  }, [user]);

  return (
    <main>
      <div className="container">
        <BannerCarousel />
        <div className="home-search-area"><SearchBar /></div>
        <CategoryGrid />

        <ProductSection title="Trending & paling disukai" icon="♥" items={trending} loading={loading} limit={10} />
        <ProductSection title="Top Up Game" icon="◇" items={topUp} loading={loading} viewAllHref="/kategori/top-up" />
        <ProductSection title="Jual Beli Akun" icon="◈" items={akun} loading={loading} viewAllHref="/kategori/akun" />
        <ProductSection title={user ? "Discover untuk kamu" : "Discover populer"} icon="✦" items={discover} loading={loading} limit={10} />

        <section className="rekber-promo">
          <div>
            <span className="rekber-promo-eyebrow">Aman & terpercaya</span>
            <h2>Transaksi lewat Grup Rekber</h2>
            <p>Buat grup sementara untuk transaksi middleman — chat, kirim bukti, dan selesaikan deal langsung dengan penjual atau pembeli, diawasi rekber.</p>
            <a href="/rekber" className="btn btn-primary">Buat Grup Rekber</a>
          </div>
        </section>
      </div>
    </main>
  );
}
