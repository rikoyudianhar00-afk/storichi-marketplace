import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function PurchaseRequestCard({ request, isSeller, currentUserId, onUpdate }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [showMidmanPicker, setShowMidmanPicker] = useState(false);
  const [midmen, setMidmen] = useState([]);
  const [selectedMidman, setSelectedMidman] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!showMidmanPicker) return;
    supabase
      .from("profiles")
      .select("id, display_name, avatar_url, bio, is_verified, is_midman")
      .eq("is_midman", true)
      .order("display_name", { ascending: true })
      .then(({ data, error: loadError }) => {
        if (loadError) setError("Daftar midman belum bisa dimuat. Pastikan migrasi database sudah dijalankan.");
        setMidmen(data || []);
      });
  }, [showMidmanPicker]);

  async function respond(status) {
    setBusy(true);
    setError("");
    const { error: updateError } = await supabase.from("purchase_requests").update({ status }).eq("id", request.id);
    setBusy(false);
    if (updateError) return setError("Status permintaan gagal diperbarui.");
    onUpdate?.({ ...request, status });
  }

  async function chooseDirect() {
    setBusy(true);
    setError("");
    const { error: directError } = await supabase.rpc("choose_direct_purchase", { p_request_id: request.id });
    setBusy(false);
    if (directError) return setError(directError.message || "Pembelian langsung gagal diaktifkan.");
    onUpdate?.({ ...request, purchase_mode: "direct" });
  }

  async function createRekber() {
    if (!selectedMidman) {
      setError("Pilih midman terlebih dahulu.");
      return;
    }
    setBusy(true);
    setError("");
    const { data: groupId, error: createError } = await supabase.rpc("create_rekber_lobby", {
      p_purchase_request_id: request.id,
      p_midman_id: selectedMidman,
    });
    setBusy(false);
    if (createError || !groupId) {
      setError(createError?.message || "Lobby Rekber gagal dibuat. Jalankan schema_v7.sql terlebih dahulu.");
      return;
    }
    navigate(`/rekber/${groupId}`);
  }

  return (
    <div className="purchase-request-card">
      <p className="purchase-request-title">Permintaan Beli</p>
      <Link to={`/produk/${request.product?.slug || ""}`} className="direct-product-preview">
        {request.product?.image_url ? <img src={request.product.image_url} alt="" /> : <span className="direct-product-preview-fallback">P</span>}
        <span><strong>{request.product?.name || "Produk"}</strong><small>{request.product?.category || "Detail produk"} · Lihat detail produk</small></span>
      </Link>

      {request.status === "pending" && isSeller && (
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button className="btn btn-primary" style={{ flex: 1 }} disabled={busy} onClick={() => respond("approved")}>Setujui</button>
          <button className="btn btn-outline" style={{ flex: 1 }} disabled={busy} onClick={() => respond("rejected")}>Tolak</button>
        </div>
      )}

      {request.status === "pending" && !isSeller && <p className="thread-item-sub" style={{ marginTop: 8 }}>Menunggu persetujuan penjual...</p>}
      {request.status === "approved" && !request.rekber_group_id && (
        <div style={{ marginTop: 10 }}>
          <p className="thread-item-sub" style={{ marginBottom: 8, color: "#0f9d68" }}>✓ Disetujui penjual</p>
          {request.purchase_mode === "direct" ? (
            <p className="direct-mode-confirmed">✓ Pembelian langsung tanpa Rekber aktif</p>
          ) : !showMidmanPicker ? (
            <div className="purchase-mode-actions">
              <button className="btn btn-primary" style={{ flex: 1 }} disabled={busy} onClick={chooseDirect}>Lanjut tanpa Rekber</button>
              <button className="btn btn-outline" style={{ flex: 1 }} disabled={busy} onClick={() => setShowMidmanPicker(true)}>Pilih Midman</button>
            </div>
          ) : (
            <div className="midman-picker">
              <label className="form-label" htmlFor="midman-select">Pilih midman</label>
              <select id="midman-select" value={selectedMidman} onChange={(e) => setSelectedMidman(e.target.value)}>
                <option value="">Pilih midman terverifikasi</option>
                {midmen.map((midman) => <option key={midman.id} value={midman.id}>{midman.display_name}{midman.is_verified ? " · Terverifikasi" : ""}</option>)}
              </select>
              <p className="thread-item-sub">Midman memegang konfirmasi item dan dana secara terpisah sampai keduanya siap dilepas.</p>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button type="button" className="btn btn-primary" style={{ flex: 1 }} disabled={busy} onClick={createRekber}>{busy ? "Membuat..." : "Buat Lobby"}</button>
                <button type="button" className="btn btn-outline" onClick={() => setShowMidmanPicker(false)}>Batal</button>
              </div>
            </div>
          )}
        </div>
      )}

      {request.status === "approved" && request.rekber_group_id && <button className="btn btn-outline btn-full" style={{ marginTop: 10 }} onClick={() => navigate(`/rekber/${request.rekber_group_id}`)}>Buka Grup Rekber</button>}
      {request.status === "rejected" && <p className="thread-item-sub" style={{ marginTop: 8, color: "var(--accent-coral)" }}>✕ Ditolak penjual</p>}
      {error && <p className="form-error" style={{ marginTop: 8 }}>{error}</p>}
    </div>
  );
}
