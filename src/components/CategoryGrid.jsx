import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function CategoryGrid() {
  const [categories, setCategories] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    Promise.all([
      supabase.from("categories").select("*").order("sort_order", { ascending: true }),
      supabase.from("category_groups").select("id, slug, label"),
    ]).then(([{ data: categoryData }, { data: groupData }]) => {
      if (!active) return;
      setCategories(categoryData || []);
      setGroups(groupData || []);
      setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const groupMap = new Map(groups.map((group) => [group.id, group]));

  if (loading) {
    return (
      <div className="category-grid">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="category-tile"><div className="skeleton category-tile-icon" /><div className="skeleton" style={{ height: 10, width: "70%" }} /></div>
        ))}
      </div>
    );
  }

  return (
    <div className="category-grid">
      {categories.map((category) => {
        const group = category.group_id ? groupMap.get(category.group_id) : null;
        return (
          <Link key={category.id} to={group ? `/grup/${group.slug}` : `/kategori/${category.slug}`} className="category-tile" title={group ? `Bagian dari grup ${group.label}` : category.label}>
            <span className={group ? "category-tile-group-marker" : "category-tile-icon-wrap"}>
              <span className="category-tile-icon category-tile-icon-img">
                {category.image_url ? <img src={category.image_url} alt={category.label} /> : <span className="category-tile-fallback">{category.label?.[0] || "K"}</span>}
              </span>
            </span>
            <span className="category-tile-label">{category.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
