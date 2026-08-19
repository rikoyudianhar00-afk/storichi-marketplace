import { Link } from "react-router-dom";
import { CATEGORIES, ICON_PATHS } from "../lib/categories";

export default function CategoryGrid() {
  return (
    <div className="category-grid">
      {CATEGORIES.map((cat) => (
        <Link key={cat.slug} to={`/kategori/${cat.slug}`} className="category-tile">
          <span className="category-tile-icon" style={{ background: cat.color }}>
            {cat.badge && <span className="category-tile-badge">{cat.badge}</span>}
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
              <path
                d={ICON_PATHS[cat.icon]}
                stroke="var(--navy-900)"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className="category-tile-label">{cat.label}</span>
        </Link>
      ))}
    </div>
  );
}
