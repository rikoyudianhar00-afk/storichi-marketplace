import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";

function generateCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "RB-";
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export default function RekberList() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState("");

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

  async function createGroup(e) {
    e.preventDefault();
    if (!name.trim() || !user) return;
    setCreating(true);
    const code = generateCode();
    const { data: group, error } = await supabase
      .from("rekber_groups")
      .insert({ name: name.trim(), code, created_by: user.id })
      .select()
      .single();

    if (error) {
      setCreating(false);
      return;
    }

    await supabase.from("rekber_members").insert({
      group_id: group.id,
      user_id: user.id,
      role: "creator",
    });

    setCreating(false);
    navigate(`/rekber/${group.id}`);
  }

  async function joinGroup(e) {
    e.preventDefault();
    setJoinError("");
    if (!joinCode.trim() || !user) return;

    const { data: group } = await supabase
      .from("rekber_groups")
      .select("*")
      .eq("code", joinCode.trim().toUpperCase())
      .eq("status", "active")
      .maybeSingle();

    if (!group) {
      setJoinError("Kode tidak ditemukan atau grup sudah selesai.");
      return;
    }

    await supabase.from("rekber_members").upsert({
      group_id: group.id,
      user_id: user.id,
      role: "member",
    });

    navigate(`/rekber/${group.id}`);
  }

  if (!user) {
    return (
      <main className="container empty-state">
        <h2>Masuk untuk membuat grup rekber</h2>
        <p>Login dengan Google untuk membuat atau bergabung ke grup rekber.</p>
      </main>
    );
  }

  return (
    <main className="container">
      <h1 className="page-title">Grup Rekber</h1>
      <p className="page-subtitle">
        Buat grup sementara untuk transaksi middleman. Grup otomatis kedaluwarsa 48 jam setelah
        dibuat.
      </p>

      <div className="rekber-forms">
        <form className="card-form" onSubmit={createGroup}>
          <h3>Buat Grup Baru</h3>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nama transaksi, misal: Jual Akun ML"
            required
          />
          <button className="btn btn-primary btn-full" disabled={creating}>
            {creating ? "Membuat..." : "Buat Grup Rekber"}
          </button>
        </form>

        <form className="card-form" onSubmit={joinGroup}>
          <h3>Gabung Pakai Kode</h3>
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            placeholder="Contoh: RB-8X4K"
          />
          {joinError && <p className="form-error">{joinError}</p>}
          <button className="btn btn-outline btn-full">Gabung Grup</button>
        </form>
      </div>

      <h3 style={{ marginTop: 32 }}>Grup Kamu</h3>
      {loading ? (
        <div className="skeleton" style={{ height: 120 }} />
      ) : groups.length === 0 ? (
        <div className="empty-state">
          <p>Belum ada grup rekber. Buat satu di atas.</p>
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
