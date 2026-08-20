import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export default function BannerCarousel() {
  const [banners, setBanners] = useState([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      const { data } = await supabase
        .from("ad_banners")
        .select("id, title, image_url, target_url, alt_text")
        .eq("is_active", true)
        .order("display_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (active) {
        setBanners(data || []);
        setActiveIndex(0);
        setLoading(false);
      }
    }
    load();
    const channel = supabase
      .channel("active_ad_banners")
      .on("postgres_changes", { event: "*", schema: "public", table: "ad_banners" }, load)
      .subscribe();
    return () => { active = false; supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    if (banners.length <= 1) return undefined;
    const timer = window.setInterval(() => setActiveIndex((index) => (index + 1) % banners.length), 5000);
    return () => window.clearInterval(timer);
  }, [banners.length]);

  if (!loading && !banners.length) return null;
  const current = banners[activeIndex];

  return (
    <section className="ad-banner-section" aria-label="Iklan unggulan">
      {loading ? (
        <div className="ad-banner-skeleton skeleton" />
      ) : (
        <div className="ad-banner-frame">
          <a href={current.target_url} className="ad-banner-link" aria-label={current.title || "Buka iklan"}>
            <img src={current.image_url} alt={current.alt_text || current.title || "Iklan Storichi"} />
            {current.title && <span className="ad-banner-caption">{current.title}</span>}
          </a>
          {banners.length > 1 && (
            <>
              <button type="button" className="ad-banner-arrow ad-banner-prev" onClick={() => setActiveIndex((index) => (index - 1 + banners.length) % banners.length)} aria-label="Iklan sebelumnya">‹</button>
              <button type="button" className="ad-banner-arrow ad-banner-next" onClick={() => setActiveIndex((index) => (index + 1) % banners.length)} aria-label="Iklan berikutnya">›</button>
              <div className="ad-banner-dots" aria-label="Pilih iklan">
                {banners.map((banner, index) => <button key={banner.id} type="button" className={index === activeIndex ? "is-active" : ""} onClick={() => setActiveIndex(index)} aria-label={`Iklan ${index + 1}`} />)}
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
