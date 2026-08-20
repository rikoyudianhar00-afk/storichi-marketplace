import { Link } from "react-router-dom";
import { StarDisplay } from "./Stars";

function formatPrice(value) {
  return value ? `Rp${Number(value).toLocaleString("id-ID")}` : "Harga belum ditentukan";
}

function formatCategoryLabel(value) {
  if (!value) return "Game";
  return String(value)
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function ProductCard({ product }) {
  const rating = Number(product.rating || 0);
  const categoryLabel = formatCategoryLabel(product.category);
  const gameTags = Array.isArray(product.game_tags) ? product.game_tags.slice(0, 2) : [];

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
        <div className="product-card-topline">
          <div className="product-card-title-block">
            <h3 className="product-card-name">{product.name}</h3>
            <span className="product-card-category">{categoryLabel}</span>
          </div>
          {gameTags.length > 0 && (
            <span className="product-card-game-tags" aria-label="Tag game produk">
              {gameTags.map((tag) => (
                <span className="product-card-game-tag" key={tag.id} title={tag.name}>
                  <img src={tag.image_url} alt={tag.name} />
                  <span>{tag.name}</span>
                </span>
              ))}
            </span>
          )}
        </div>
        <strong className="product-card-price">{formatPrice(product.price_from)}</strong>
        <div className="product-card-meta">
          <span>{Number(product.sales_count || 0).toLocaleString("id-ID")} terjual</span>
          <span className="product-card-rating-stack">
            <span className="product-card-views">{Number(product.view_count || 0).toLocaleString("id-ID")} kunjungan</span>
            <StarDisplay rating={rating} count={product.rating_count || 0} />
          </span>
        </div>
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

export default function ProductSection({ title, icon, categoryLabel, items, viewAllHref, loading, limit }) {
  const visibleItems = limit ? items.slice(0, limit) : items;
  return (
    <section className="product-section">
      <div className="product-section-head">
        <h2><span aria-hidden="true">{icon}</span> {title}{categoryLabel && <small className="product-section-category-label">{categoryLabel}</small>}</h2>
        {viewAllHref && <Link to={viewAllHref} className="see-all">Lihat Semua <span aria-hidden="true">→</span></Link>}
      </div>
      <div className="product-section-panel">
        <ProductList items={visibleItems} loading={loading} />
      </div>
    </section>
  );
}
