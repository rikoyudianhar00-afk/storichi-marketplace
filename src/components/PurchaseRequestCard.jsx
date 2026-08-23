import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { dispatchNativePush } from "../lib/nativePush";

const VERIFIED_NOTICE_KEY = "storichi_rekber_verified_notice_dismissed";

function candidateKind(profile) {
  if (profile?.is_midman) return "midman";
  if (profile?.is_verified) return "verified";
  return "regular";
}

function candidateLabel(profile) {
  const kind = candidateKind(profile);
  return kind === "midman" ? "⚖️ Midman (MM)" : kind === "verified" ? "Verified MM" : "Midman (MM)";
}

function invitationLabel(invitation) {
  return invitation?.third_party_kind === "midman" ? "⚖️ Midman (MM)" : invitation?.third_party_kind === "verified" ? "Verified MM" : "Midman (MM)";
}

export default function PurchaseRequestCard({ request, isSeller, currentUserId, onUpdate }) {
  const navigate = useNavigate();
  const isBuyer = request.buyer_id === currentUserId;
  const [busy, setBusy] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [profiles, setProfiles] = useState([]);
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [search, setSearch] = useState("");
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const [invitation, setInvitation] = useState(null);
  const [verifiedNotice, setVerifiedNotice] = useState(null);
  const [skipVerifiedNotice, setSkipVerifiedNotice] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (request.status !== "approved" || request.rekber_group_id || request.purchase_mode === "direct") {
      setInvitation(null);
      return undefined;
    }
    let active = true;
    const loadInvitation = async () => {
      const { data, error: loadError } = await supabase
        .from("rekber_invitations")
        .select("*, third_party:profiles!rekber_invitations_third_party_id_fkey(id, display_name, avatar_url, bio, is_verified, is_midman, is_owner)")
        .eq("purchase_request_id", request.id)
        .maybeSingle();
      if (!active) return;
      if (loadError && loadError.code !== "PGRST116") setError("Undangan Midman (MM) belum dapat dimuat.");
      setInvitation(data || null);
    };
    loadInvitation();
    const invitationChannel = supabase.channel(`purchase-invitation-${request.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "rekber_invitations", filter: `purchase_request_id=eq.${request.id}` }, loadInvitation)
      .subscribe();
    return () => {
      active = false;
      supabase.removeChannel(invitationChannel);
    };
  }, [request.id, request.status, request.rekber_group_id, request.purchase_mode]);

  useEffect(() => {
    if (!showPicker || !isSeller) return undefined;
    let active = true;
    setLoadingProfiles(true);
    setError("");
    supabase
      .from("profiles")
      .select("id, display_name, avatar_url, bio, is_verified, is_midman, is_owner, rekber_invite_count")
      .neq("id", request.buyer_id)
      .neq("id", request.seller_id)
      .neq("id", currentUserId)
      .then(({ data, error: loadError }) => {
        if (!active) return;
        if (loadError) setError("Daftar pengguna belum bisa dimuat.");
        const score = (profile) => {
          const priority = profile.is_midman ? 3 : profile.is_verified ? 2 : 1;
          return priority * 100000 + Math.min(Number(profile.rekber_invite_count || 0), 9999);
        };
        setProfiles((data || []).sort((a, b) => score(b) - score(a) || String(a.display_name || "").localeCompare(String(b.display_name || ""), "id")));
        setLoadingProfiles(false);
      });
    return () => { active = false; };
  }, [showPicker, isSeller, request.buyer_id, request.seller_id, currentUserId]);

  const normalizedSearch = search.trim().toLocaleLowerCase("id");
  const visibleProfiles = profiles.filter((profile) => !normalizedSearch || [profile.display_name, profile.bio, profile.is_midman ? "midman" : "", profile.is_verified ? "verified" : "", "pengguna biasa"].filter(Boolean).some((value) => String(value).toLocaleLowerCase("id").includes(normalizedSearch)));
  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId) || null;

  async function respond(status) {
    setBusy(true); setError("");
    const { error: updateError } = await supabase.from("purchase_requests").update({ status }).eq("id", request.id);
    setBusy(false);
    if (updateError) return setError("Status permintaan gagal diperbarui.");
    onUpdate?.({ ...request, status });
    void dispatchNativePush({ event: "purchase-decision", purchaseRequestId: request.id });
  }

  async function chooseDirect() {
    setBusy(true); setError("");
    const { error: directError } = await supabase.rpc("choose_direct_purchase", { p_request_id: request.id });
    setBusy(false);
    if (directError) return setError(directError.message || "Pembelian tanpa Rekber gagal diaktifkan.");
    onUpdate?.({ ...request, purchase_mode: "direct" });
  }

  function selectProfile(profile) {
    if (candidateKind(profile) === "verified") {
      const dismissed = typeof window !== "undefined" && window.localStorage.getItem(VERIFIED_NOTICE_KEY) === "1";
      if (!dismissed) {
        setVerifiedNotice(profile);
        setSkipVerifiedNotice(false);
        return;
      }
    }
    setSelectedProfileId(profile.id);
    setVerifiedNotice(null);
    setError("");
  }

  function confirmVerified() {
    if (!verifiedNotice) return;
    if (skipVerifiedNotice && typeof window !== "undefined") window.localStorage.setItem(VERIFIED_NOTICE_KEY, "1");
    setSelectedProfileId(verifiedNotice.id);
    setVerifiedNotice(null);
  }

  async function inviteDirectThirdParty() {
    if (!selectedProfile) return setError("Pilih Midman (MM) terlebih dahulu.");
    setBusy(true); setError("");
    const { data, error: inviteError } = await supabase.rpc("invite_rekber_third_party", { p_purchase_request_id: request.id, p_third_party_id: selectedProfile.id });
    setBusy(false);
    if (inviteError || !data) return setError(inviteError?.message || "Undangan Midman (MM) gagal dikirim.");
    setInvitation(data);
    void supabase.functions.invoke("send-rekber-invite-push", { body: { invitationId: data.id } });
    setShowPicker(false);
    setSelectedProfileId("");
    onUpdate?.({ ...request, rekber_invitation_id: data.id });
  }

  async function inviteRegular() {
    if (!selectedProfile) return setError("Pilih Midman (MM) terlebih dahulu.");
    setBusy(true); setError("");
    const { data, error: inviteError } = await supabase.rpc("invite_rekber_third_party", { p_purchase_request_id: request.id, p_third_party_id: selectedProfile.id });
    setBusy(false);
    if (inviteError || !data) return setError(inviteError?.message || "Pengajuan Midman (MM) gagal dikirim. Jalankan migrasi Rekber terbaru.");
    setInvitation(data);
    void supabase.functions.invoke("send-rekber-invite-push", { body: { invitationId: data.id } });
    setShowPicker(false);
    setSelectedProfileId("");
    onUpdate?.({ ...request, rekber_invitation_id: data.id });
  }

  async function respondInvitation(accept) {
    if (!invitation?.id || !isBuyer || invitation.third_party_kind !== "regular") return;
    setBusy(true); setError("");
    const { error: responseError } = await supabase.rpc("respond_rekber_invitation", { p_invitation_id: invitation.id, p_accept: accept });
    setBusy(false);
    if (responseError) return setError(responseError.message || "Persetujuan Midman (MM) gagal diproses.");
    if (!accept) {
      setInvitation((current) => current ? { ...current, status: "declined" } : current);
      void dispatchNativePush({ event: "rekber-buyer-decision", invitationId: invitation.id });
      return;
    }
    void supabase.functions.invoke("send-rekber-invite-push", { body: { invitationId: invitation.id } });
    void dispatchNativePush({ event: "rekber-buyer-decision", invitationId: invitation.id });
    setInvitation((current) => current ? { ...current, status: "buyer_approved", buyer_approved_at: new Date().toISOString() } : current);
  }

  const invitationPending = invitation && invitation.status === "pending";
  const invitationNeedsBuyerApproval = invitationPending && invitation.third_party_kind === "regular";
  const invitationWaiting = invitation && invitation.status === "buyer_approved";

  return (
    <div className="purchase-request-card">
      <p className="purchase-request-title">Permintaan Beli</p>
      <Link to={`/produk/${request.product?.slug || ""}`} className="direct-product-preview">
        {request.product?.image_url ? <img src={request.product.image_url} alt="" /> : <span className="direct-product-preview-fallback">P</span>}
        <span><strong>{request.product?.name || "Produk"}</strong><small>{request.product?.category || "Detail produk"} · Lihat detail produk</small></span>
      </Link>

      {request.status === "pending" && isSeller && <div className="purchase-mode-actions"><button className="btn btn-primary" disabled={busy} onClick={() => respond("approved")}>Setujui</button><button className="btn btn-outline" disabled={busy} onClick={() => respond("rejected")}>Tolak</button></div>}
      {request.status === "pending" && !isSeller && <p className="thread-item-sub" style={{ marginTop: 8 }}>Menunggu persetujuan Seller...</p>}

      {request.status === "approved" && !request.rekber_group_id && <div style={{ marginTop: 10 }}>
        <p className="thread-item-sub" style={{ marginBottom: 8, color: "#0f9d68" }}>✓ Disetujui Seller</p>
        {request.purchase_mode === "direct" ? <p className="direct-mode-confirmed">✓ Pembelian tanpa Rekber aktif</p> : invitation?.status === "declined" ? <div className="pre-lobby-invitation-card"><p className="form-error">Pengajuan Midman (MM) ditolak. Seller dapat memilih ulang.</p>{isSeller && <button className="btn btn-outline" onClick={() => { setInvitation(null); setShowPicker(true); }}>Pilih ulang Midman (MM)</button>}</div> : invitationPending ? <div className="pre-lobby-invitation-card"><div className={`third-party-preview third-party-preview-${invitation.third_party_kind}`}><span className="third-party-preview-avatar">{invitation.third_party?.avatar_url ? <img src={invitation.third_party.avatar_url} alt="" /> : <span>{invitation.third_party?.display_name?.[0] || "U"}</span>}</span><span><strong>{invitation.third_party?.display_name || "Midman (MM)"}</strong><small>{invitationLabel(invitation)} · Menunggu persetujuan</small></span></div>{invitationNeedsBuyerApproval ? isBuyer ? <><p>Seller mengajukan Midman (MM) ini. Setujui agar undangan diteruskan kepada Midman (MM).</p><div className="pre-lobby-actions"><button className="btn btn-primary" disabled={busy} onClick={() => respondInvitation(true)}>Setujui pengajuan</button><button className="btn btn-outline" disabled={busy} onClick={() => respondInvitation(false)}>Tolak</button></div></> : <p className="thread-item-sub">Menunggu Buyer menyetujui pengajuan Midman (MM).</p> : <p className="thread-item-sub">Undangan {invitationLabel(invitation)} sudah dikirim. Menunggu Midman (MM) menerimanya melalui notifikasi Rekber.</p>}</div> : invitationWaiting ? <div className="pre-lobby-invitation-card"><p className="third-party-consent-wait">✓ Buyer sudah menyetujui. Menunggu Midman (MM) menerima undangan.</p></div> : !showPicker ? <div className="purchase-mode-actions">{isSeller && <><button className="btn btn-primary" disabled={busy} onClick={chooseDirect}>Lanjut tanpa Rekber</button><button className="btn btn-outline" disabled={busy} onClick={() => setShowPicker(true)}>Lanjut dengan Rekber</button></>}{isBuyer && <p className="thread-item-sub">Menunggu Seller memilih tanpa Rekber atau Rekber.</p>}</div> : <div className="midman-picker">
          <div className="midman-picker-heading"><div><strong>Pilih Midman (MM) Rekber</strong><p className="thread-item-sub">Semua Midman (MM) menerima undangan terlebih dahulu. Pengguna biasa harus diajukan ke Buyer sebelum undangan diteruskan.</p></div><button type="button" className="midman-picker-close" onClick={() => setShowPicker(false)} aria-label="Tutup">×</button></div>
          <label className="midman-search-box" htmlFor={`midman-search-${request.id}`}><span aria-hidden="true">⌕</span><input id={`midman-search-${request.id}`} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari nama pengguna..." autoComplete="off" /></label>
          {loadingProfiles ? <div className="midman-result-empty">Memuat pengguna...</div> : !visibleProfiles.length ? <div className="midman-result-empty">Pengguna tidak ditemukan.</div> : <div className="midman-result-list" role="listbox" aria-label="Hasil pengguna">{visibleProfiles.map((profile) => { const kind = candidateKind(profile); const selected = selectedProfileId === profile.id; return <div className={`midman-result ${selected ? "is-selected" : ""} ${kind === "regular" ? "is-regular" : ""}`} key={profile.id}><span className="midman-result-avatar">{profile.avatar_url ? <img src={profile.avatar_url} alt="" /> : <span>{profile.display_name?.[0] || "U"}</span>}</span><span className="midman-result-copy"><strong>{profile.display_name || "Pengguna"}</strong><small>{candidateLabel(profile)}{kind === "regular" ? " · ajukan ke Buyer" : kind === "verified" ? " · peringatan ringan lalu undangan" : " · undangan menunggu persetujuan"}{Number(profile.rekber_invite_count || 0) > 0 ? ` · ${Number(profile.rekber_invite_count)} undangan` : ""}</small></span><button type="button" className="midman-add-button" disabled={busy} onClick={() => selectProfile(profile)} aria-label={`Pilih ${profile.display_name || "pengguna"}`}>{selected ? "✓" : "+"}</button></div>; })}</div>}
          {selectedProfile && <div className={`third-party-preview third-party-preview-${candidateKind(selectedProfile)}`}><span className="third-party-preview-avatar">{selectedProfile.avatar_url ? <img src={selectedProfile.avatar_url} alt="" /> : <span>{selectedProfile.display_name?.[0] || "U"}</span>}</span><span><strong>{selectedProfile.display_name}</strong><small>{candidateLabel(selectedProfile)} · {candidateKind(selectedProfile) === "regular" ? "menunggu persetujuan Buyer" : "siap diundang"}</small></span></div>}
          <p className="thread-item-sub midman-picker-note">Belum ada grup yang dibuat pada tahap pemilihan ini. Midman (MM) harus menerima undangan terlebih dahulu.</p>
          <div className="midman-picker-footer"><span>{selectedProfile ? candidateLabel(selectedProfile) : "Belum dipilih"}</span><div style={{ display: "flex", gap: 8 }}><button type="button" className="btn btn-primary" disabled={busy || !selectedProfile} onClick={candidateKind(selectedProfile) === "regular" ? inviteRegular : inviteDirectThirdParty}>{busy ? "Memproses..." : candidateKind(selectedProfile) === "regular" ? "Ajukan ke Buyer" : "Undang sekarang"}</button><button type="button" className="btn btn-outline" onClick={() => setShowPicker(false)}>Batal</button></div></div>
        </div>}
      </div>}

      {request.status === "approved" && request.rekber_group_id && <p className="third-party-consent-wait" style={{ marginTop: 10 }}>✓ Midman (MM) terhubung di chat transaksi ini. Aktivasi Rekening Bersama dilakukan oleh Midman (MM) dari halaman chat.</p>}
      {request.status === "rejected" && <p className="thread-item-sub" style={{ marginTop: 8, color: "var(--accent-coral)" }}>✕ Ditolak penjual</p>}
      {error && <p className="form-error" style={{ marginTop: 8 }}>{error}</p>}

      {verifiedNotice && <div className="direct-action-modal" role="dialog" aria-modal="true" aria-labelledby={`verified-title-${request.id}`}><div className="direct-action-modal-card third-party-notice-card"><div className="third-party-notice-icon">✓</div><h3 id={`verified-title-${request.id}`}>Verified MM</h3><p><strong>{verifiedNotice.display_name}</strong> memiliki badge verified, tetapi bukan Midman resmi. Pilihan ini tetap bisa digunakan, namun Storichi menyarankan Midman resmi untuk pengamanan transaksi.</p><label><input type="checkbox" checked={skipVerifiedNotice} onChange={(e) => setSkipVerifiedNotice(e.target.checked)} /> Jangan ingatkan lagi di perangkat ini</label><div className="direct-action-modal-actions"><button type="button" className="btn btn-outline" onClick={() => setVerifiedNotice(null)}>Batal</button><button type="button" className="btn btn-primary" onClick={confirmVerified}>Saya mengerti</button></div></div></div>}
    </div>
  );
}
