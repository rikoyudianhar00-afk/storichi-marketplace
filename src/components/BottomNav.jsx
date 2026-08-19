import { NavLink } from "react-router-dom";

const ITEMS = [
  { to: "/", label: "Beranda", icon: "M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-8Z" },
  { to: "/favorit", label: "Favorit", icon: "M12 20s-7-4.4-9.5-9A5.5 5.5 0 0 1 12 6a5.5 5.5 0 0 1 9.5 5c-2.5 4.6-9.5 9-9.5 9Z" },
  { to: "/transaksi", label: "Transaksi", icon: "m7 8 4-4 4 4M7 16l4 4 4-4M11 4v16" },
  { to: "/rekber", label: "Rekber", icon: "M12 3 4 6v6c0 4.6 3.2 8.4 8 9 4.8-.6 8-4.4 8-9V6l-8-3Z" },
  { to: "/akun", label: "Akun", icon: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8c1.2-3.5 4-5.5 7-5.5s5.8 2 7 5.5" },
];

export default function BottomNav() {
  return (
    <nav className="bottom-nav">
      <div className="bottom-nav-inner">
        {ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) => "bottom-nav-item" + (isActive ? " active" : "")}
          >
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none">
              <path d={item.icon} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {item.label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
