import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";

function invitationRole(invitation) {
  return invitation.third_party_kind === "regular" ? "pihak ketiga" : invitation.third_party_kind === "verified" ? "pengguna verified" : "⚖️ Midman";
}

export default function RekberList() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [groups, setGroups] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return undefined;
    loadGroupsAndInvitations();
    const channel = supabase.channel(`rekber-list-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "rekber_invitations", filter: `third_party_id=eq.${user.id}` }, loadGroupsAndInvitations)
      .on("postgres_changes", { event: "*", schema: "public", table: "rekber_members", filter: `user_id=eq.${user.id}` }, loadGroupsAndInvitations)
      .on("postgres_changes", { event: "*", schema: "public", table: "rekber_groups" }, loadGroupsAndInvitations)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  async function loadGroupsAndInvitations() {
    if (!user) return;
    setLoading(true);
    const [{ data: memberships }, { data: pendingInvitations, error: invitationError }] = await Promise.all([
      supabase.from("rekber_members").select("group:rekber_groups(*, purchase_request:purchase_requests(thread_id))").eq("user_id", user.id),
      supabase.from("rekber_invitations").select("*, purchase_request:purchase_requests(thread_id), buyer:profiles!rekber_invitations_buyer_id_fkey(id, display_name, avatar_url), seller:profiles!rekber_invitations_seller_id_fkey(id, display_name, avatar_url)").eq("third_party_id", user.id).or("status.in.(buyer_approved,accepted),and(status.eq.pending,third_party_kind.in.(midman,verified))").order("created_at", { ascending: false }),
    ]);
    if (invitationError) setError("Notifikasi undangan belum dapat dimuat. Jalankan schema_v25.sql.");
    setGroups((memberships || []).map((membership) => membership.group).filter(Boolean));
    setInvitations(pendingInvitations || []);
    setLoading(false);
  }

  async function respondInvitation(invitation, accept) {
    setBusyId(invitation.id);
    setError("");
    const { data: groupId, error: responseError } = await supabase.rpc("respond_rekber_third_party_invitation", { p_invitation_id: invitation.id, p_accept: accept });
    setBusyId("");
    if (responseError) return setError(responseError.message || "Respons undangan gagal diproses.");
    if (!accept) {
      setInvitations((current) => current.filter((item) => item.id !== invitation.id));
      return;
    }
    if (groupId) {
      if (invitation.purchase_request?.thread_id) navigate(`/chat/${invitation.purchase_request.thread_id}`);
      else navigate(`/rekber/${groupId}`);
      return;
    }
    setInvitations((current) => current.map((item) => item.id === invitation.id ? { ...item, status: "accepted", third_party_approved_at: new Date().toISOString() } : item));
    setError("Persetujuan pihak ketiga tercatat. Grup akan dibuat setelah persetujuan pembeli tersedia.");
  }

  if (!user) return <main className="container empty-state"><h2>Masuk untuk melihat grup rekber</h2><p>Login untuk melihat grup dan undangan Rekber.</p></main>;

  return (
    <main className="container rekber-list-page">
      <h1 className="page-title">Grup Rekber</h1>
      <p className="page-subtitle">Undangan pihak ketiga dan lobby Rekber kamu tampil di sini.</p>
      {error && <p className="form-error rekber-invitation-error">{error}</p>}
      {invitations.length > 0 && <section className="rekber-invitation-section"><div className="rekber-list-section-heading"><div><span className="section-kicker">Notifikasi</span><h2>Undangan pihak ketiga</h2></div><span className="notification-count-badge">{invitations.length}</span></div>{invitations.map((invitation) => <article className="rekber-invitation-card" key={invitation.id}><div className="rekber-invitation-avatar">{invitation.seller?.avatar_url ? <img src={invitation.seller.avatar_url} alt="" /> : <span>{invitation.seller?.display_name?.[0] || "S"}</span>}</div><div className="rekber-invitation-copy"><strong>{invitation.seller?.display_name || "Penjual"} mengundangmu sebagai {invitationRole(invitation)}</strong><span>Pembeli: {invitation.buyer?.display_name || "Pembeli"}</span><small>{invitation.status === "pending" && invitation.third_party_kind !== "regular" ? "Undangan menunggu persetujuan pihak ketiga." : "Undangan muncul setelah pembeli menyetujui pengajuan pihak ketiga."}</small><div className="rekber-invitation-actions"><button className="btn btn-primary" disabled={busyId === invitation.id || Boolean(invitation.third_party_approved_at)} onClick={() => respondInvitation(invitation, true)}>{busyId === invitation.id ? "Memproses..." : invitation.third_party_approved_at ? "Sudah disetujui" : "Terima undangan"}</button>{!invitation.third_party_approved_at && <button className="btn btn-outline" disabled={busyId === invitation.id} onClick={() => respondInvitation(invitation, false)}>Tolak</button>}</div></div></article>)}</section>}
      {loading ? <div className="skeleton" style={{ height: 120 }} /> : groups.length === 0 ? <div className="empty-state"><p>{invitations.length ? "Selesaikan persetujuan undangan untuk membuat atau masuk ke lobby Rekber." : "Belum ada lobby Rekber. Mulai dari chat setelah penjual menyetujui permintaan beli."}</p><Link to="/chat" className="btn btn-primary" style={{ marginTop: 12 }}>Buka Chat</Link></div> : <section className="rekber-groups-section"><div className="rekber-list-section-heading"><div><span className="section-kicker">Transaksi</span><h2>Lobby kamu</h2></div></div><div className="rekber-group-list">{groups.map((group) => <Link key={group.id} to={group.purchase_request?.thread_id ? `/chat/${group.purchase_request.thread_id}` : `/rekber/${group.id}`} className="rekber-group-item"><div><div className="thread-item-title">{group.name}</div><div className="thread-item-sub">Kode: {group.code}</div></div><span className={`status-pill status-${group.status}`}>{group.status === "active" ? "Aktif" : group.status === "completed" ? "Selesai" : "Batal"}</span></Link>)}</div></section>}
    </main>
  );
}
