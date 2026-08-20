import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useUnreadChatNotifications } from "../lib/chatNotifications";
import { supabase } from "../lib/supabase";

export default function Navbar() {
  const { user, profile, signInWithGoogle, signOut } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const isShopPage = location.pathname.startsWith("/toko/");
  const unreadCount = useUnreadChatNotifications(user?.id);
  const [customLinks, setCustomLinks] = useState([]);
  const [categoryGroups, setCategoryGroups] = useState([]);
  const [drawerCategories, setDrawerCategories] = useState([]);
  const [openGroups, setOpenGroups] = useState({});

  useEffect(() => {
    if (!menuOpen) return;
    Promise.all([
      supabase.from("navigation_links").select("id, label, href").eq("is_active", true).order("display_order").order("created_at"),
      supabase.from("category_groups").select("id, slug, label, sort_order").order("label", { ascending: true }),
      supabase.from("categories").select("id, slug, label, group_id, sort_order").order("label", { ascending: true }),
    ]).then(([navigationResult, groupResult, categoryResult]) => {
      setCustomLinks(navigationResult.data || []);
      setCategoryGroups(groupResult.data || []);
      setDrawerCategories(categoryResult.data || []);
    });
  }, [menuOpen]);

  function closeMenu() {
    setMenuOpen(false);
  }

  function toggleGroup(groupId) {
    setOpenGroups((current) => ({ ...current, [groupId]: !current[groupId] }));
  }

  function categoryHref(category) {
    return `/kategori/${category.slug || category.id}`;
  }

  const sortedGroups = [...categoryGroups].sort((a, b) => a.label.localeCompare(b.label, "id", { sensitivity: "base" }));
  const groupedCategoryIds = new Set(sortedGroups.flatMap((group) => drawerCategories.filter((category) => category.group_id === group.id).map((category) => category.id)));
  const standaloneCategories = drawerCategories
    .filter((category) => !groupedCategoryIds.has(category.id))
    .sort((a, b) => a.label.localeCompare(b.label, "id", { sensitivity: "base" }));

  return (
    <header className="navbar">
      <div className="navbar-top container">
        {isShopPage ? (
          <Link to="/" className="icon-btn navbar-menu-btn navbar-home-corner" aria-label="Kembali ke beranda" title="Kembali ke beranda">
            <img src="/storichi-logo.jpg" alt="" />
          </Link>
        ) : (
          <button
            className="icon-btn navbar-menu-btn"
            aria-label="Buka menu"
            onClick={() => setMenuOpen((v) => !v)}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        )}

        <Link to="/" className="navbar-logo" aria-label="STORICHI Beranda">
          <img className="navbar-logo-image" src="/storichi-logo.jpg" alt="" />
          <span>STORICHI</span>
        </Link>

        <div className="navbar-actions">
          <Link to="/cari" className="icon-btn" aria-label="Cari produk" title="Cari produk">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
              <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </Link>
          {user ? (
            <div className="navbar-user">
              <Link to="/chat" className="icon-btn navbar-chat-link" aria-label={unreadCount ? `Chat, ${unreadCount} pesan belum dibaca` : "Chat"}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M21 11.5a8.38 8.38 0 0 1-8.5 8.4 8.5 8.5 0 0 1-4-1L3 20l1.1-5.5A8.4 8.4 0 1 1 21 11.5Z"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinejoin="round"
                  />
                </svg>
                {unreadCount > 0 && <span className="navbar-notification-badge">{unreadCount > 99 ? "99+" : unreadCount}</span>}
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


      {menuOpen && (
        <>
          <button type="button" className="navbar-drawer-backdrop" aria-label="Tutup menu" onClick={() => setMenuOpen(false)} />
          <nav className="navbar-drawer">
            {sortedGroups.map((group) => {
              const members = drawerCategories
                .filter((category) => category.group_id === group.id)
                .sort((a, b) => a.label.localeCompare(b.label, "id", { sensitivity: "base" }));
              return (
                <div className="navbar-drawer-group" key={group.id}>
                  <button type="button" className="navbar-drawer-group-toggle" onClick={() => toggleGroup(group.id)} aria-expanded={Boolean(openGroups[group.id])}>
                    <span>{group.label}</span>
                    <span className={`navbar-drawer-chevron ${openGroups[group.id] ? "is-open" : ""}`} aria-hidden="true">⌄</span>
                  </button>
                  {openGroups[group.id] && (
                    <div className="navbar-drawer-submenu">
                      {members.length ? members.map((category) => <Link key={category.id} to={categoryHref(category)} onClick={closeMenu}>{category.label}</Link>) : <span className="navbar-drawer-empty">Belum ada kategori</span>}
                    </div>
                  )}
                </div>
              );
            })}

            <Link to="/" onClick={closeMenu}>Beranda</Link>
            {(customLinks.length ? customLinks : [
              { id: "top-up", label: "Top Up Game", href: "/kategori/top-up" },
              { id: "akun", label: "Jual Beli Akun", href: "/kategori/akun" },
              { id: "jual", label: "Jual Produk", href: "/jual/baru" },
              { id: "rekber", label: "Grup Rekber", href: "/rekber" },
            ]).map((link) => <a key={link.id} href={link.href} onClick={closeMenu}>{link.label}</a>)}
            {standaloneCategories.map((category) => <Link key={category.id} to={categoryHref(category)} onClick={closeMenu}>{category.label}</Link>)}
            <Link to="/chat" onClick={closeMenu}>Chat</Link>
            <Link to="/bantuan" onClick={closeMenu}>Cara Pakai & Bantuan</Link>
            {user && (
              <button className="navbar-drawer-signout" onClick={() => { closeMenu(); signOut(); }}>
                Keluar
              </button>
            )}
          </nav>
        </>
      )}
    </header>
  );
}
