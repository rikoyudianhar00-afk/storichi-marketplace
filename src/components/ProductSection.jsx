import { Link } from "react-router-dom";

export function ProductCard({ product }) {
  return (
    <Link to={`/produk/${product.slug}`} className="product-card">
      <div className="product-card-thumb">
        {product.image_url ? (
          <img src={product.image_url} alt={product.name} loading="lazy" />
        ) : (
          <div className="product-card-thumb-fallback">{product.name[0]}</div>
        )}
      </div>
      <div className="product-card-name">{product.name}</div>
      {product.price_from && (
        <div className="product-card-price">mulai Rp{Number(product.price_from).toLocaleString("id-ID")}</div>
      )}
    </Link>
  );
}

export default function ProductSection({ title, icon, items, viewAllHref, loading }) {
  return (
    <section className="product-section">
      <div className="product-section-head">
        <h2>
          <span aria-hidden="true">{icon}</span> {title}
        </h2>
        {viewAllHref && (
          <Link to={viewAllHref} className="see-all">
            Lihat Semua
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="m9 6 6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        )}
      </div>
      <div className="product-section-panel">
        <div className="product-grid">
          {loading
            ? Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="product-card-skeleton">
                  <div className="skeleton" style={{ aspectRatio: "1/1" }} />
                  <div className="skeleton" style={{ height: 12, width: "80%", marginTop: 8 }} />
                </div>
              ))
            : items.map((p) => <ProductCard key={p.id} product={p} />)}
        </div>
      </div>
    </section>
  );
}
