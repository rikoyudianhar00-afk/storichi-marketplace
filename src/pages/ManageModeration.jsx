import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";

function formatModerationDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
}

function statusLabel(record) {
  if (record.permanently_banned) return "Banned permanen";
  if (record.strike_level >= 2) return "SP 2";
  if (record.strike_level >= 1) return "Peringatan / pembatasan";
  return "Dipantau";
}

export default function ManageModeration() {
  const { profile } = useAuth();
  const [accounts, setAccounts] = useState([]);
  const [events, setEvents] = useState([]);
  const [pairs, setPairs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    const [{ data: moderationData, error: moderationError }, { data: eventData, error: eventError }, { data: pairData, error: pairError }] = await Promise.all([
      supabase.from("account_moderation").select("*, profile:profiles(id, display_name, email, avatar_url)").order("strike_level", { ascending: false }).order("updated_at", { ascending: false }),
      supabase.from("moderation_events").select("*").order("created_at", { ascending: false }).limit(50),
      supabase.from("moderation_pair_controls").select("*").gt("blocked_until", new Date().toISOString()).order("blocked_until", { ascending: false }),
    ]);
    if (moderationError || eventError || pairError) setError("Data moderasi belum dapat dimuat. Pastikan schema_v18.sql sudah dijalankan.");
    setAccounts(moderationData || []);
    setEvents(eventData || []);
    setPairs(pairData || []);
    setLoading(false);
  }

  useEffect(() => {
    if (profile?.is_owner) load();
  }, [profile?.is_owner]);

  async function liftBan(userId) {
    if (!window.confirm("Cabut banned permanen akun ini? Pastikan keputusan ini sudah ditinjau Owner.")) return;
    setBusyId(userId);
    const { error: liftError } = await supabase.rpc("lift_storichi_permanent_ban", { p_user_id: userId, p_reason: "Banned ditinjau dan dicabut oleh Owner" });
    setBusyId("");
    if (liftError) setError(liftError.message || "Banned belum dapat dicabut.");
    else load();
  }

  if (!profile?.is_owner) return <main className="container empty-state"><p>Halaman ini hanya dapat dibuka oleh Owner.</p></main>;
  if (loading) return <main className="container"><div className="skeleton" style={{ height: 360, marginTop: 24 }} /></main>;

  return (
    <main className="container manage-moderation-page">
      <div className="page-heading-row"><div><span className="section-kicker">Keamanan marketplace</span><h1 className="page-title">Kelola Moderasi</h1><p className="page-subtitle">Tinjau pola transaksi berulang, peringatan, SP, dan banned permanen.</p></div><button type="button" className="btn btn-outline" onClick={load}>Muat ulang</button></div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <section className="moderation-policy-card"><strong>Aturan anti-manipulasi</strong><p>Lebih dari 5 transaksi antara pembeli dan penjual yang sama dalam 30 menit memicu peringatan keras dan pembatasan pasangan selama 6 jam. Pengulangan setelah pembatasan meningkatkan SP hingga SP3 dan dapat memasukkan kedua akun ke banned permanen.</p></section>
      <section className="moderation-account-list"><h2>Akun yang terdeteksi</h2>{accounts.length ? accounts.map((account) => <article className="moderation-account-card" key={account.user_id}><div className="moderation-account-avatar">{account.profile?.avatar_url ? <img src={account.profile.avatar_url} alt="" /> : <span>{account.profile?.display_name?.[0] || "U"}</span>}</div><div className="moderation-account-copy"><strong>{account.profile?.display_name || "Pengguna"}</strong><small>{account.profile?.email || account.user_id}</small><span>{statusLabel(account)} · diperbarui {formatModerationDate(account.updated_at)}</span>{account.banned_reason && <em>{account.banned_reason}</em>}</div>{account.permanently_banned && <button type="button" className="btn btn-outline moderation-lift-btn" disabled={busyId === account.user_id} onClick={() => liftBan(account.user_id)}>{busyId === account.user_id ? "Memproses..." : "Cabut banned"}</button>}</article>) : <p className="empty-state">Belum ada akun yang tercatat.</p>}</section>
      <section className="moderation-event-list"><h2>Pasangan yang sedang dibatasi</h2>{pairs.length ? pairs.map((pair) => <article className="moderation-event-row" key={`${pair.pair_low_id}-${pair.pair_high_id}`}><strong>Blokir 6 jam</strong><span>{pair.pair_low_id} ↔ {pair.pair_high_id} · terdeteksi {pair.detection_count} kali</span><time>{formatModerationDate(pair.blocked_until)}</time></article>) : <p className="empty-state">Belum ada pasangan yang sedang dibatasi.</p>}</section>
      <section className="moderation-event-list"><h2>Riwayat kejadian terbaru</h2>{events.length ? events.map((event) => <article className="moderation-event-row" key={event.id}><strong>{event.event_type.replaceAll("_", " ")}</strong><span>{event.reason}</span><time>{formatModerationDate(event.created_at)}</time></article>) : <p className="empty-state">Belum ada kejadian moderasi.</p>}</section>
    </main>
  );
}
