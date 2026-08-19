import { useEffect, useState } from "react";
import CategoryGrid from "../components/CategoryGrid";
import ProductSection from "../components/ProductSection";
import SearchBar from "../components/SearchBar";
import { enrichProducts, topProducts } from "../lib/catalog";
import { supabase } from "../lib/supabase";

export default function Home() {
  const [topUp, setTopUp] = useState([]);
  const [akun, setAkun] = useState([]);
  const [trending, setTrending] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      const [{ data: topUpData }, { data: akunData }, { data: trendingData }] = await Promise.all([
        supabase.from("products").select("*").eq("category", "top-up").eq("is_active", true).limit(8),
        supabase.from("products").select("*").eq("category", "akun").eq("is_active", true).limit(8),
        supabase
          .from("products")
          .select("*")
          .eq("is_active", true)
          .order("like_count", { ascending: false })
          .order("view_count", { ascending: false })
          .limit(10),
      ]);
      const [topUpProducts, akunProducts, trendingProducts] = await Promise.all([
        enrichProducts(topUpData || []),
        enrichProducts(akunData || []),
        enrichProducts(trendingData || []),
      ]);
      if (!active) return;
      setTopUp(topUpProducts);
      setAkun(akunProducts);
      setTrending(topProducts(trendingProducts, 10));
      setLoading(false);
    }
    load();
    return () => { active = false; };
  }, []);

  return (
    <main>
      <div className="container">
        <div className="home-search-area"><SearchBar /></div>
        <CategoryGrid />

        <ProductSection title="Trending & paling disukai" icon="♥" items={trending} loading={loading} limit={10} />
        <ProductSection title="Top Up Game" icon="◇" items={topUp} loading={loading} viewAllHref="/kategori/top-up" />
        <ProductSection title="Jual Beli Akun" icon="◈" items={akun} loading={loading} viewAllHref="/kategori/akun" />

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
