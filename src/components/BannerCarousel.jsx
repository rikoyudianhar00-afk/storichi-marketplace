import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export default function BannerCarousel() {
  const [banners, setBanners] = useState([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [touchStartX, setTouchStartX] = useState(null);

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
  function move(delta) { setActiveIndex((index) => (index + delta + banners.length) % banners.length); }
  function finishSwipe(event) {
    if (touchStartX == null) return;
    const distance = event.changedTouches[0].clientX - touchStartX;
    if (Math.abs(distance) > 45) move(distance < 0 ? 1 : -1);
    setTouchStartX(null);
  }

  return (
    <section className="ad-banner-section" aria-label="Iklan unggulan">
      {loading ? (
        <div className="ad-banner-skeleton skeleton" />
      ) : (
        <div className="ad-banner-frame" onTouchStart={(event) => setTouchStartX(event.touches[0].clientX)} onTouchEnd={finishSwipe}>
          <div className="ad-banner-track" style={{ transform: `translateX(calc(-${activeIndex} * (100% + 12px)))` }}>
            {banners.map((banner) => (
              <a key={banner.id} href={banner.target_url} className="ad-banner-link" aria-label={banner.title || "Buka iklan"}>
                <img src={banner.image_url} alt={banner.alt_text || banner.title || "Iklan Storichi"} />
                {banner.title && <span className="ad-banner-caption">{banner.title}</span>}
              </a>
            ))}
          </div>
          {banners.length > 1 && (
            <>
              <button type="button" className="ad-banner-arrow ad-banner-prev" onClick={() => move(-1)} aria-label="Iklan sebelumnya">‹</button>
              <button type="button" className="ad-banner-arrow ad-banner-next" onClick={() => move(1)} aria-label="Iklan berikutnya">›</button>
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
