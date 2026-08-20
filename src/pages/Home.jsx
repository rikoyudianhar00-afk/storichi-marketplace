import { useEffect, useState } from "react";
import CategoryGrid from "../components/CategoryGrid";
import ProductSection from "../components/ProductSection";
import SearchBar from "../components/SearchBar";
import BannerCarousel from "../components/BannerCarousel";
import { useAuth } from "../context/AuthContext";
import { enrichProducts, topProducts } from "../lib/catalog";
import { supabase } from "../lib/supabase";

function tokens(values) {
  return [...new Set(values.flatMap((value) => String(value || "").toLocaleLowerCase("id").split(/[^a-z0-9]+/).filter((token) => token.length >= 2)))];
}

function personalizeProducts(products, searchEvents, purchases) {
  const searchTokens = tokens((searchEvents || []).map((event) => event.query));
  const purchaseCategories = new Set((purchases || []).map((purchase) => purchase.product?.category).filter(Boolean).map((value) => String(value).toLocaleLowerCase("id")));
  const purchaseGames = new Set((purchases || []).map((purchase) => purchase.product?.game_name).filter(Boolean).map((value) => String(value).toLocaleLowerCase("id")));
  const purchaseSellers = new Set((purchases || []).map((purchase) => purchase.seller_id).filter(Boolean));
  return [...products].map((product) => {
    const searchable = String([product.name, product.description, product.category, product.game_name].filter(Boolean).join(" ")).toLocaleLowerCase("id");
    const productTokens = tokens([product.name, product.description, product.category, product.game_name]);
    const textScore = searchTokens.reduce((score, term) => score + (searchable.includes(term) ? 8 : 0), 0);
    const categoryScore = purchaseCategories.has(String(product.category || "").toLocaleLowerCase("id")) ? 12 : 0;
    const gameScore = purchaseGames.has(String(product.game_name || "").toLocaleLowerCase("id")) ? 14 : 0;
    const sellerScore = purchaseSellers.has(product.seller_id) ? 10 : 0;
    const overlapScore = productTokens.filter((token) => searchTokens.includes(token)).length * 2;
    const popularityScore = Math.min(10, Math.log1p(Number(product.sales_count || 0)) * 2 + Math.log1p(Number(product.like_count || 0)));
    return { product, score: textScore + categoryScore + gameScore + sellerScore + overlapScore + popularityScore };
  }).sort((a, b) => b.score - a.score || Number(b.product.sales_count || 0) - Number(a.product.sales_count || 0)).map(({ product }) => product);
}

export default function Home() {
  const [trending, setTrending] = useState([]);
  const [discover, setDiscover] = useState([]);
  const [homeSections, setHomeSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    let active = true;
    async function load() {
      const [{ data: trendingData }, { data: follows }, { data: managedSections, error: managedSectionsError }, { data: searchEvents }, { data: purchases }, { data: candidateData }] = await Promise.all([
        supabase.from("products").select("*").eq("is_active", true).gt("stock", 0).order("like_count", { ascending: false }).order("view_count", { ascending: false }).limit(10),
        user ? supabase.from("seller_follows").select("seller_id").eq("follower_id", user.id) : Promise.resolve({ data: [] }),
        supabase.from("home_sections").select("*, home_section_products(*, product:products(*))").eq("is_active", true).order("display_order", { ascending: true }).order("created_at", { ascending: true }),
        user ? supabase.from("user_search_events").select("query, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(30) : Promise.resolve({ data: [] }),
        user ? supabase.from("purchase_requests").select("seller_id, product:products(category, game_name, name)").eq("buyer_id", user.id).eq("status", "completed").order("completed_at", { ascending: false }).limit(30) : Promise.resolve({ data: [] }),
        user ? supabase.from("products").select("*").eq("is_active", true).gt("stock", 0).order("created_at", { ascending: false }).limit(80) : Promise.resolve({ data: [] }),
      ]);
      const followedSellerIds = (follows || []).map((follow) => follow.seller_id);
      const { data: followedProducts } = followedSellerIds.length
        ? await supabase.from("products").select("*").in("seller_id", followedSellerIds).eq("is_active", true).gt("stock", 0).order("created_at", { ascending: false }).limit(10)
        : { data: [] };
      const [trendingProducts, candidateProducts, followedEnriched] = await Promise.all([
        enrichProducts(trendingData || []),
        enrichProducts([...new Map([...(candidateData || []), ...(followedProducts || [])].map((product) => [product.id, product])).values()]),
        enrichProducts(followedProducts || []),
      ]);
      const discoverProducts = user
        ? personalizeProducts(candidateProducts, searchEvents || [], purchases || [])
        : followedEnriched;
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
      setTrending(topProducts(trendingProducts, 10));
      setDiscover(discoverProducts.length ? discoverProducts.slice(0, 10) : topProducts(trendingProducts, 10));
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

        {homeSections.length ? <>
          {homeSections.map((section) => <ProductSection key={section.id} title={section.title} icon={section.icon || "✦"} categoryLabel={section.category_label} items={section.items} loading={loading} viewAllHref={section.view_all_href || undefined} limit={10} />)}
          <ProductSection title={user ? "Discover untuk kamu" : "Discover populer"} icon="✦" items={discover} loading={loading} limit={10} />
        </> : <>
          <ProductSection title="Trending & paling disukai" icon="♥" items={trending} loading={loading} limit={10} />
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
