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
  const [homeSections, setHomeSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    let active = true;
    async function load() {
      const [{ data: topUpData }, { data: akunData }, { data: trendingData }, { data: follows }, { data: managedSections, error: managedSectionsError }] = await Promise.all([
        supabase.from("products").select("*").eq("category", "top-up").eq("is_active", true).gt("stock", 0).limit(8),
        supabase.from("products").select("*").eq("category", "akun").eq("is_active", true).gt("stock", 0).limit(8),
        supabase.from("products").select("*").eq("is_active", true).gt("stock", 0).order("like_count", { ascending: false }).order("view_count", { ascending: false }).limit(10),
        user ? supabase.from("seller_follows").select("seller_id").eq("follower_id", user.id) : Promise.resolve({ data: [] }),
        supabase.from("home_sections").select("*, home_section_products(*, product:products(*))").eq("is_active", true).order("display_order", { ascending: true }).order("created_at", { ascending: true }),
      ]);
      const followedSellerIds = (follows || []).map((follow) => follow.seller_id);
      const { data: followedProducts } = followedSellerIds.length
        ? await supabase.from("products").select("*").in("seller_id", followedSellerIds).eq("is_active", true).gt("stock", 0).order("created_at", { ascending: false }).limit(10)
        : { data: [] };
      const [topUpProducts, akunProducts, trendingProducts, discoverProducts] = await Promise.all([
        enrichProducts(topUpData || []),
        enrichProducts(akunData || []),
        enrichProducts(trendingData || []),
        enrichProducts(followedProducts || []),
      ]);
      const rawManagedSections = !managedSectionsError ? (managedSections || []) : [];
      const managedRawProducts = rawManagedSections.flatMap((section) => (section.home_section_products || []).map((assignment) => assignment.product).filter(Boolean));
      const managedProducts = await enrichProducts([...new Map(managedRawProducts.map((product) => [product.id, product])).values()]);
      const managedProductMap = new Map(managedProducts.map((product) => [product.id, product]));
      const nextHomeSections = rawManagedSections.map((section) => ({
        ...section,
        items: [...(section.home_section_products || [])]
          .sort((a, b) => Number(a.display_order || 0) - Number(b.display_order || 0))
          .map((assignment) => {
            const product = managedProductMap.get(assignment.product_id);
            if (!product || product.is_active === false || Number(product.stock ?? 1) <= 0) return null;
            return { ...product, name: assignment.title_override?.trim() || product.name };
          })
          .filter(Boolean),
      })).filter((section) => section.items.length);
      if (!active) return;
      setTopUp(topUpProducts);
      setAkun(akunProducts);
      setTrending(topProducts(trendingProducts, 10));
      setDiscover(discoverProducts.length ? discoverProducts : topProducts(trendingProducts, 10));
      setHomeSections(nextHomeSections);
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

        {homeSections.length ? homeSections.map((section) => <ProductSection key={section.id} title={section.title} icon={section.icon || "✦"} categoryLabel={section.category_label} items={section.items} loading={loading} viewAllHref={section.view_all_href || undefined} limit={10} />) : <>
          <ProductSection title="Trending & paling disukai" icon="♥" items={trending} loading={loading} limit={10} />
          <ProductSection title="Top Up Game" icon="◇" items={topUp} loading={loading} viewAllHref="/kategori/top-up" />
          <ProductSection title="Jual Beli Akun" icon="◈" items={akun} loading={loading} viewAllHref="/kategori/akun" />
          <ProductSection title={user ? "Discover untuk kamu" : "Discover populer"} icon="✦" items={discover} loading={loading} limit={10} />
        </>}

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
