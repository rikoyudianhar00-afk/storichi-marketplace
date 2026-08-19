import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Navbar() {
  const { user, profile, signInWithGoogle, signOut } = useAuth();
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();

  function handleSearch(e) {
    e.preventDefault();
    if (query.trim()) navigate(`/cari?q=${encodeURIComponent(query.trim())}`);
  }

  return (
    <header className="navbar">
      <div className="navbar-top container">
        <button
          className="icon-btn navbar-menu-btn"
          aria-label="Buka menu"
          onClick={() => setMenuOpen((v) => !v)}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>

        <Link to="/" className="navbar-logo">
          <span className="navbar-logo-mark">S</span>
          <span>storichi</span>
        </Link>

        <div className="navbar-actions">
          {user ? (
            <div className="navbar-user">
              <Link to="/chat" className="icon-btn" aria-label="Chat">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M21 11.5a8.38 8.38 0 0 1-8.5 8.4 8.5 8.5 0 0 1-4-1L3 20l1.1-5.5A8.4 8.4 0 1 1 21 11.5Z"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinejoin="round"
                  />
                </svg>
              </Link>
              <Link to="/akun" className="navbar-avatar">
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt="" />
                ) : (
                  <span>{(profile?.display_name || "U")[0].toUpperCase()}</span>
                )}
              </Link>
            </div>
          ) : (
            <button className="btn btn-light" onClick={signInWithGoogle}>
              Masuk
            </button>
          )}
          {/* Note: full Google icon shown on /akun sign-in view */}
        </div>
      </div>

      <div className="navbar-search container">
        <form onSubmit={handleSearch} className="search-bar">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
            <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari game, akun, diamond, top up..."
            aria-label="Cari produk"
          />
        </form>
      </div>

      {menuOpen && (
        <nav className="navbar-drawer">
          <Link to="/" onClick={() => setMenuOpen(false)}>Beranda</Link>
          <Link to="/kategori/top-up" onClick={() => setMenuOpen(false)}>Top Up Game</Link>
          <Link to="/kategori/akun" onClick={() => setMenuOpen(false)}>Jual Beli Akun</Link>
          <Link to="/rekber" onClick={() => setMenuOpen(false)}>Grup Rekber</Link>
          <Link to="/chat" onClick={() => setMenuOpen(false)}>Chat</Link>
          {user && (
            <button className="navbar-drawer-signout" onClick={signOut}>
              Keluar
            </button>
          )}
        </nav>
      )}
    </header>
  );
}
