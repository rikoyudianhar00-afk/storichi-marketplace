import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";

export default function SearchBar({ initialValue = "", autoFocus = false, placeholder = "Cari game, akun, diamond, top up...", className = "", onSearch }) {
  const [query, setQuery] = useState(initialValue);
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => setQuery(initialValue), [initialValue]);

  function handleSearch(e) {
    e.preventDefault();
    const value = query.trim();
    if (user && value) {
      supabase.from("user_search_events").insert({ user_id: user.id, query: value.slice(0, 120) }).then(() => {});
    }
    if (onSearch) {
      onSearch(value);
      return;
    }
    navigate(value ? `/cari?q=${encodeURIComponent(value)}` : "/cari");
  }

  return (
    <form onSubmit={handleSearch} className={`search-bar search-page-bar ${className}`.trim()}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
        <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        aria-label="Cari produk"
        autoFocus={autoFocus}
      />
      <button type="submit" className="search-submit">Cari</button>
    </form>
  );
}
