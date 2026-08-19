import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import RoleBadge from "../components/RoleBadge";
import { StarInput } from "../components/Stars";
import AttachmentButton from "../components/AttachmentButton";
import { moderateMessage } from "../lib/moderation";
import { supabase } from "../lib/supabase";

const WORKFLOW_LABELS = {
  waiting_for_deposit: "Menunggu dana dan item diserahkan",
  waiting_for_item: "Dana sudah dipegang, menunggu item",
  ready_to_release: "Dana dan item siap dilepas",
  released: "Dana dan item sudah dilepas",
};

function roleLabel(role) {
  return role === "buyer" ? "Pembeli" : role === "seller" ? "Penjual" : role === "midman" ? "Midman" : "Peserta";
}

export default function RekberRoom() {
  const { groupId } = useParams();
  const { user } = useAuth();
  const [group, setGroup] = useState(null);
  const [members, setMembers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [chatError, setChatError] = useState("");
  const [workflowError, setWorkflowError] = useState("");
  const [workflowBusy, setWorkflowBusy] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewComment, setReviewComment] = useState("");
  const bottomRef = useRef(null);

  const isMidman = group?.midman_id === user?.id;
  const isCreator = group?.created_by === user?.id;

  useEffect(() => {
    if (!user || !groupId) return undefined;
    let active = true;

    async function load() {
      const [{ data: g }, { data: m }, { data: msgs }] = await Promise.all([
        supabase.from("rekber_groups").select("*, purchase_request:purchase_requests(product:products(name, image_url))").eq("id", groupId).maybeSingle(),
        supabase.from("rekber_members").select("*, profile:profiles(id, display_name, avatar_url, bio, is_seller, is_verified, is_midman, is_owner)").eq("group_id", groupId),
        supabase.from("rekber_messages").select("*").eq("group_id", groupId).order("created_at", { ascending: true }),
      ]);
      if (!active) return;
      setGroup(g);
      setMembers(m || []);
      setMessages(msgs || []);
      setLoading(false);
    }

    load();
    const channel = supabase
      .channel(`rekber_${groupId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "rekber_messages", filter: `group_id=eq.${groupId}` }, (payload) => {
        setMessages((prev) => prev.some((message) => message.id === payload.new.id) ? prev : [...prev, payload.new]);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "rekber_groups", filter: `id=eq.${groupId}` }, (payload) => setGroup((current) => ({ ...current, ...payload.new })))
      .on("postgres_changes", { event: "*", schema: "public", table: "rekber_members", filter: `group_id=eq.${groupId}` }, load)
      .subscribe();

    return () => { active = false; supabase.removeChannel(channel); };
  }, [groupId, user]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  async function sendMessage(e) {
    e.preventDefault();
    if (!text.trim() || !user) return;
    const result = moderateMessage(text);
    if (!result.allowed) {
      setChatError(result.message);
      return;
    }
    setChatError("");
    setText("");
    const { error } = await supabase.from("rekber_messages").insert({ group_id: groupId, sender_id: user.id, content: result.value });
    if (error) setChatError("Pesan gagal dikirim.");
  }

  async function sendAttachment({ url, type }) {
    if (!user) return;
    const { error } = await supabase.from("rekber_messages").insert({ group_id: groupId, sender_id: user.id, content: type === "video" ? "Video" : "Gambar", attachment_url: url, attachment_type: type });
    if (error) setChatError("Lampiran gagal dikirim.");
  }

  async function updateWorkflow(action) {
    setWorkflowBusy(true);
    setWorkflowError("");
    const { data, error } = await supabase.rpc("update_rekber_workflow", { p_group_id: groupId, p_action: action });
    setWorkflowBusy(false);
    if (error) {
      setWorkflowError(error.message || "Status Rekber gagal diperbarui.");
      return;
    }
    if (data) setGroup(data);
    if (action === "release") setShowReview(true);
  }

  async function cancelLobby() {
    if (!isCreator || group.status !== "active") return;
    const { error } = await supabase.from("rekber_groups").update({ status: "cancelled", workflow_status: "cancelled" }).eq("id", groupId);
    if (error) setWorkflowError("Lobby tidak dapat dibatalkan.");
  }

  async function submitReview() {
    if (!reviewRating || !group?.seller_id) return;
    await supabase.from("seller_reviews").insert({ seller_id: group.seller_id, reviewer_id: user.id, purchase_request_id: group.purchase_request_id, rating: reviewRating, comment: reviewComment.trim() || null });
    setShowReview(false);
  }

  if (!user) return <main className="container empty-state"><h2>Masuk untuk membuka Rekber</h2></main>;
  if (loading) return <main className="chat-thread-page"><div className="skeleton" style={{ height: "70vh" }} /></main>;
  if (!group) return <main className="container empty-state"><p>Lobby Rekber tidak ditemukan atau kamu belum menjadi peserta.</p></main>;

  const workflowStatus = group.workflow_status || "waiting_for_deposit";
  const active = group.status === "active";

  return (
    <main className="chat-thread-page rekber-room-page">
      <header className="chat-conversation-header rekber-conversation-header">
        <div className="chat-conversation-info"><strong>{group.name}</strong><span>Kode {group.code} · {members.length}/3 peserta</span></div>
        <span className={`status-pill status-${group.status}`}>{active ? "Aktif" : group.status === "completed" ? "Selesai" : "Batal"}</span>
      </header>

      <section className="rekber-workflow-card">
        <div className="rekber-workflow-heading"><div><span className="section-kicker">Rekber 3 pihak</span><h2>Alur penyerahan aman</h2></div><strong>{WORKFLOW_LABELS[workflowStatus] || workflowStatus}</strong></div>
        <p className="rekber-workflow-note">Pembeli menyerahkan dana dan penjual menyerahkan item kepada midman. Setelah keduanya dikonfirmasi, midman melepas item kepada pembeli dan dana kepada penjual.</p>
        <div className="rekber-role-grid">
          {members.map((member) => <div key={member.id} className={`rekber-role-card ${member.role}`}><strong>{roleLabel(member.role)}</strong><span>{member.profile?.display_name || "Pengguna"}</span>{member.profile?.is_midman && <RoleBadge profile={member.profile} />}</div>)}
        </div>
        {isMidman && active && (
          <div className="rekber-midman-actions">
            <p className="thread-item-sub">Kontrol Midman</p>
            <div className="rekber-action-grid">
              {group.funds_status !== "held" && <button className="btn btn-outline" disabled={workflowBusy} onClick={() => updateWorkflow("confirm_funds")}>Konfirmasi dana dipegang</button>}
              {group.item_status !== "held" && <button className="btn btn-outline" disabled={workflowBusy} onClick={() => updateWorkflow("confirm_item")}>Konfirmasi item dipegang</button>}
              {group.funds_status === "held" && group.item_status === "held" && <button className="btn btn-primary" disabled={workflowBusy} onClick={() => updateWorkflow("release")}>Lepaskan dana & item</button>}
            </div>
          </div>
        )}
        <div className="rekber-status-lines"><span>Dana: <b>{group.funds_status === "held" ? "Dipegang midman" : "Menunggu konfirmasi"}</b></span><span>Item: <b>{group.item_status === "held" ? "Dipegang midman" : "Menunggu konfirmasi"}</b></span></div>
        {workflowError && <p className="form-error">{workflowError}</p>}
      </section>

      {showReview && <div className="container review-form-box"><h3 style={{ fontSize: 14.5, marginBottom: 8 }}>Beri penilaian untuk penjual</h3><StarInput value={reviewRating} onChange={setReviewRating} /><textarea value={reviewComment} onChange={(e) => setReviewComment(e.target.value)} placeholder="Ulasan (opsional)" rows={2} style={{ marginTop: 8 }} /><button className="btn btn-primary" onClick={submitReview} style={{ marginTop: 8 }}>Kirim Penilaian</button></div>}

      <div className="chat-messages">
        <div className="chat-day-label">Chat Rekber</div>
        {messages.map((message) => <div key={message.id} className={`chat-message-row ${message.sender_id === user.id ? "is-mine" : "is-theirs"}`}><div className="chat-bubble">{message.attachment_url ? (message.attachment_type === "video" ? <video src={message.attachment_url} controls className="chat-attachment-media" /> : <img src={message.attachment_url} alt="Lampiran pesan" className="chat-attachment-media" />) : <span>{message.content}</span>}<time>{new Date(message.created_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</time></div></div>)}
        <div ref={bottomRef} />
      </div>
      {chatError && <div className="chat-moderation-notice" role="alert">{chatError}</div>}
      {active ? <form className="chat-input-bar" onSubmit={sendMessage}><AttachmentButton userId={user.id} onUploaded={sendAttachment} /><input value={text} onChange={(e) => setText(e.target.value)} placeholder="Tulis pesan ke peserta Rekber..." aria-label="Tulis pesan" /><button type="submit" className="chat-send-button" disabled={!text.trim()} aria-label="Kirim pesan">↑</button></form> : <p className="rekber-closed-note">Lobby ini sudah {group.status === "completed" ? "selesai" : "dibatalkan"}.</p>}
      {isCreator && active && <button className="rekber-cancel-button" type="button" onClick={cancelLobby}>Batalkan lobby</button>}
    </main>
  );
}
