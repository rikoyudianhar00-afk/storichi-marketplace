import { Link } from "react-router-dom";
import { StarDisplay } from "./Stars";
import RoleBadge from "./RoleBadge";

function formatPrice(value) {
  return value ? `Rp${Number(value).toLocaleString("id-ID")}` : "Harga belum ditentukan";
}

export function ProductCard({ product }) {
  const rating = Number(product.rating || 0);
  const description = product.description?.trim() || "Lihat detail produk untuk informasi selengkapnya.";

  return (
    <Link to={`/produk/${product.slug}`} className="product-list-card">
      <div className="product-list-thumb-wrap">
        <div className="product-list-thumb">
          {product.image_url ? (
            <img src={product.image_url} alt={product.name} loading="lazy" />
          ) : (
            <div className="product-card-thumb-fallback">{product.name?.[0] || "P"}</div>
          )}
        </div>
      </div>
      <div className="product-list-content">
        <div className="product-list-title-row">
          <h3 className="product-card-name">{product.name}</h3>
        </div>
        <div className="product-list-seller-row">
          {product.seller?.display_name && <span className="product-list-seller">{product.seller.display_name}</span>}
          {product.seller && <RoleBadge profile={product.seller} size={16} />}
          <StarDisplay rating={rating} count={product.rating_count || 0} />
          <strong className="product-card-price">{formatPrice(product.price_from)}</strong>
        </div>
        <p className="product-list-description">{description}</p>
      </div>
    </Link>
  );
}

export function ProductList({ items = [], loading = false, emptyText = "Belum ada produk." }) {
  if (loading) {
    return (
      <div className="product-list">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="product-list-card-skeleton">
            <div className="skeleton" />
            <div className="product-list-skeleton-copy">
              <div className="skeleton" />
              <div className="skeleton" />
              <div className="skeleton" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!items.length) return <div className="empty-state product-list-empty"><p>{emptyText}</p></div>;
  return <div className="product-list">{items.map((product) => <ProductCard key={product.id} product={product} />)}</div>;
}

export default function ProductSection({ title, icon, items, viewAllHref, loading, limit }) {
  const visibleItems = limit ? items.slice(0, limit) : items;
  return (
    <section className="product-section">
      <div className="product-section-head">
        <h2><span aria-hidden="true">{icon}</span> {title}</h2>
        {viewAllHref && <Link to={viewAllHref} className="see-all">Lihat Semua <span aria-hidden="true">→</span></Link>}
      </div>
      <div className="product-section-panel">
        <ProductList items={visibleItems} loading={loading} />
      </div>
    </section>
  );
}
