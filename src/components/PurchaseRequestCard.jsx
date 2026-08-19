import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

function generateCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "RB-";
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export default function PurchaseRequestCard({ request, isSeller, currentUserId, onUpdate }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  async function respond(status) {
    setBusy(true);
    await supabase.from("purchase_requests").update({ status }).eq("id", request.id);
    setBusy(false);
    onUpdate?.({ ...request, status });
  }

  async function createRekber() {
    setBusy(true);
    const code = generateCode();
    const { data: group } = await supabase
      .from("rekber_groups")
      .insert({ name: `Rekber: ${request.product?.name || "Transaksi"}`, code, created_by: currentUserId })
      .select()
      .single();

    if (group) {
      await supabase.from("rekber_members").insert([
        { group_id: group.id, user_id: request.buyer_id, role: "member" },
        { group_id: group.id, user_id: request.seller_id, role: "member" },
      ]);
      await supabase.from("purchase_requests").update({ rekber_group_id: group.id }).eq("id", request.id);
      navigate(`/rekber/${group.id}`);
    }
    setBusy(false);
  }

  return (
    <div className="purchase-request-card">
      <p className="purchase-request-title">Permintaan Beli</p>
      <p className="purchase-request-product">{request.product?.name}</p>

      {request.status === "pending" && isSeller && (
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button className="btn btn-primary" style={{ flex: 1 }} disabled={busy} onClick={() => respond("approved")}>
            Setujui
          </button>
          <button className="btn btn-outline" style={{ flex: 1 }} disabled={busy} onClick={() => respond("rejected")}>
            Tolak
          </button>
        </div>
      )}

      {request.status === "pending" && !isSeller && (
        <p className="thread-item-sub" style={{ marginTop: 8 }}>Menunggu persetujuan penjual...</p>
      )}

      {request.status === "approved" && !request.rekber_group_id && (
        <div style={{ marginTop: 10 }}>
          <p className="thread-item-sub" style={{ marginBottom: 8, color: "#0f9d68" }}>✓ Disetujui penjual</p>
          <button className="btn btn-primary btn-full" disabled={busy} onClick={createRekber}>
            {busy ? "Membuat..." : "Buat Grup Rekber"}
          </button>
        </div>
      )}

      {request.status === "approved" && request.rekber_group_id && (
        <button className="btn btn-outline btn-full" style={{ marginTop: 10 }} onClick={() => navigate(`/rekber/${request.rekber_group_id}`)}>
          Buka Grup Rekber
        </button>
      )}

      {request.status === "rejected" && (
        <p className="thread-item-sub" style={{ marginTop: 8, color: "var(--accent-coral)" }}>✕ Ditolak penjual</p>
      )}
    </div>
  );
}
