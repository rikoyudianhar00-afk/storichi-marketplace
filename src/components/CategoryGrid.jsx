import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function CategoryGrid() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("categories")
      .select("*")
      .order("sort_order", { ascending: true })
      .then(({ data }) => {
        setCategories(data || []);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="category-grid">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="category-tile">
            <div className="skeleton category-tile-icon" />
            <div className="skeleton" style={{ height: 10, width: "70%" }} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="category-grid">
      {categories.map((cat) => (
        <Link key={cat.id} to={`/kategori/${cat.slug}`} className="category-tile">
          <span className="category-tile-icon category-tile-icon-img">
            {cat.image_url ? (
              <img src={cat.image_url} alt={cat.label} />
            ) : (
              <span className="category-tile-fallback">{cat.label[0]}</span>
            )}
          </span>
          <span className="category-tile-label">{cat.label}</span>
        </Link>
      ))}
    </div>
  );
}
