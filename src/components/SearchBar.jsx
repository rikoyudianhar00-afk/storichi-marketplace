import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

export default function SearchBar({ initialValue = "", autoFocus = false }) {
  const [query, setQuery] = useState(initialValue);
  const navigate = useNavigate();

  useEffect(() => setQuery(initialValue), [initialValue]);

  function handleSearch(e) {
    e.preventDefault();
    const value = query.trim();
    navigate(value ? `/cari?q=${encodeURIComponent(value)}` : "/cari");
  }

  return (
    <form onSubmit={handleSearch} className="search-bar search-page-bar">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
        <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Cari game, akun, diamond, top up..."
        aria-label="Cari produk"
        autoFocus={autoFocus}
      />
      <button type="submit" className="search-submit">Cari</button>
    </form>
  );
}
