import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";

export default function RekberList() {
  const { user } = useAuth();
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    loadGroups();
  }, [user]);

  async function loadGroups() {
    const { data: memberships } = await supabase
      .from("rekber_members")
      .select("group:rekber_groups(*)")
      .eq("user_id", user.id);
    setGroups((memberships || []).map((m) => m.group).filter(Boolean));
    setLoading(false);
  }

  if (!user) {
    return (
      <main className="container empty-state">
        <h2>Masuk untuk melihat grup rekber</h2>
        <p>Login dengan Google untuk melihat grup rekber kamu.</p>
      </main>
    );
  }

  return (
    <main className="container">
      <h1 className="page-title">Grup Rekber</h1>
      <p className="page-subtitle">
        Grup rekber otomatis dibuat saat penjual menyetujui permintaan beli di chat. Buka dari
        percakapan produk untuk memulai transaksi rekber.
      </p>

      {loading ? (
        <div className="skeleton" style={{ height: 120 }} />
      ) : groups.length === 0 ? (
        <div className="empty-state">
          <p>Belum ada grup rekber. Grup akan muncul otomatis setelah transaksi disetujui di chat.</p>
          <Link to="/chat" className="btn btn-primary" style={{ marginTop: 12 }}>
            Buka Chat
          </Link>
        </div>
      ) : (
        <div className="rekber-group-list">
          {groups.map((g) => (
            <Link key={g.id} to={`/rekber/${g.id}`} className="rekber-group-item">
              <div>
                <div className="thread-item-title">{g.name}</div>
                <div className="thread-item-sub">Kode: {g.code}</div>
              </div>
              <span className={"status-pill status-" + g.status}>
                {g.status === "active" ? "Aktif" : g.status === "completed" ? "Selesai" : "Batal"}
              </span>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
