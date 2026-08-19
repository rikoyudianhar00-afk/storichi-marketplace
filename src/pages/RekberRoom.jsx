import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import RoleBadge from "../components/RoleBadge";
import { StarInput } from "../components/Stars";
import AttachmentButton from "../components/AttachmentButton";

export default function RekberRoom() {
  const { groupId } = useParams();
  const { user } = useAuth();
  const [group, setGroup] = useState(null);
  const [members, setMembers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [showReview, setShowReview] = useState(false);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewComment, setReviewComment] = useState("");
  const bottomRef = useRef(null);

  const isCreator = group?.created_by === user?.id;

  useEffect(() => {
    async function load() {
      const [{ data: g }, { data: m }, { data: msgs }] = await Promise.all([
        supabase.from("rekber_groups").select("*").eq("id", groupId).single(),
        supabase.from("rekber_members").select("*, profile:profiles(display_name, avatar_url, is_seller, is_verified, is_midman, is_owner)").eq("group_id", groupId),
        supabase.from("rekber_messages").select("*").eq("group_id", groupId).order("created_at", { ascending: true }),
      ]);
      setGroup(g);
      setMembers(m || []);
      setMessages(msgs || []);
      setLoading(false);
    }
    load();

    const channel = supabase
      .channel(`rekber_${groupId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "rekber_messages", filter: `group_id=eq.${groupId}` },
        (payload) => setMessages((prev) => [...prev, payload.new])
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rekber_members", filter: `group_id=eq.${groupId}` },
        () => refreshMembers()
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [groupId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function refreshMembers() {
    const { data } = await supabase
      .from("rekber_members")
      .select("*, profile:profiles(display_name, avatar_url, is_seller, is_verified, is_midman, is_owner)")
      .eq("group_id", groupId);
    setMembers(data || []);
  }

  async function sendMessage(e) {
    e.preventDefault();
    if (!text.trim() || !user) return;
    const content = text.trim();
    setText("");
    await supabase.from("rekber_messages").insert({
      group_id: groupId,
      sender_id: user.id,
      content,
    });
  }

  async function sendAttachment({ url, type }) {
    if (!user) return;
    await supabase.from("rekber_messages").insert({
      group_id: groupId,
      sender_id: user.id,
      content: type === "video" ? "📹 Video" : "🖼️ Gambar",
      attachment_url: url,
      attachment_type: type,
    });
  }

  async function updateStatus(status) {
    await supabase.from("rekber_groups").update({ status }).eq("id", groupId);
    setGroup((g) => ({ ...g, status }));
    if (status === "completed") setShowReview(true);
  }

  async function inviteUser(e) {
    e.preventDefault();
    setInviteError("");
    if (!inviteEmail.trim()) return;

    const { data: targetProfile } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", inviteEmail.trim())
      .maybeSingle();

    if (!targetProfile) {
      setInviteError("Pengguna dengan email itu belum terdaftar di Storichi.");
      return;
    }

    const { error } = await supabase.from("rekber_members").insert({
      group_id: groupId,
      user_id: targetProfile.id,
      role: "member",
    });

    if (error) {
      setInviteError("Gagal menambahkan (mungkin sudah jadi anggota).");
      return;
    }

    setInviteEmail("");
    refreshMembers();
  }

  async function submitReview() {
    if (!reviewRating) return;
    const sellerMember = members.find((m) => m.profile?.is_seller || m.user_id !== user.id);
    const sellerId = sellerMember?.user_id;
    if (!sellerId) return;

    await supabase.from("seller_reviews").insert({
      seller_id: sellerId,
      reviewer_id: user.id,
      rating: reviewRating,
      comment: reviewComment.trim() || null,
    });
    setShowReview(false);
  }

  if (loading) return <div className="container skeleton" style={{ height: 300, marginTop: 20 }} />;
  if (!group) return <div className="container empty-state"><p>Grup tidak ditemukan.</p></div>;

  return (
    <main className="chat-thread-page">
      <div className="rekber-room-header container">
        <div>
          <h2 style={{ margin: 0 }}>{group.name}</h2>
          <p className="thread-item-sub">
            Kode: <strong>{group.code}</strong> · {members.length} anggota
          </p>
        </div>
        <span className={"status-pill status-" + group.status}>
          {group.status === "active" ? "Aktif" : group.status === "completed" ? "Selesai" : "Batal"}
        </span>
      </div>

      <div className="container rekber-member-list">
        {members.map((m) => (
          <span key={m.id} className="rekber-member-chip">
            {m.profile?.display_name} <RoleBadge profile={m.profile} />
          </span>
        ))}
      </div>

      {isCreator && group.status === "active" && (
        <>
          <form className="container invite-form" onSubmit={inviteUser}>
            <input
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="Email untuk invite mid man / anggota lain"
            />
            <button className="btn btn-outline">Invite</button>
          </form>
          {inviteError && <p className="container form-error">{inviteError}</p>}

          <div className="rekber-room-actions container">
            <button className="btn btn-outline" onClick={() => updateStatus("completed")}>
              Tandai Selesai
            </button>
            <button className="btn btn-outline" onClick={() => updateStatus("cancelled")}>
              Batalkan
            </button>
          </div>
        </>
      )}

      {showReview && (
        <div className="container review-form-box">
          <h3 style={{ fontSize: 14.5, marginBottom: 8 }}>Beri penilaian untuk penjual</h3>
          <StarInput value={reviewRating} onChange={setReviewRating} />
          <textarea
            value={reviewComment}
            onChange={(e) => setReviewComment(e.target.value)}
            placeholder="Ulasan (opsional)"
            rows={2}
            style={{ marginTop: 8 }}
          />
          <button className="btn btn-primary" onClick={submitReview} style={{ marginTop: 8 }}>
            Kirim Penilaian
          </button>
        </div>
      )}

      <div className="chat-messages">
        {messages.map((m) => (
          <div key={m.id} className={"chat-bubble" + (m.sender_id === user?.id ? " chat-bubble-mine" : "")}>
            {m.attachment_url ? (
              m.attachment_type === "video" ? (
                <video src={m.attachment_url} controls className="chat-attachment-media" />
              ) : (
                <img src={m.attachment_url} alt="" className="chat-attachment-media" />
              )
            ) : (
              m.content
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {group.status === "active" ? (
        <form className="chat-input-bar" onSubmit={sendMessage}>
          <AttachmentButton userId={user?.id} onUploaded={sendAttachment} />
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Tulis pesan ke grup..."
            aria-label="Tulis pesan"
          />
          <button type="submit" className="btn btn-primary" disabled={!text.trim()}>
            Kirim
          </button>
        </form>
      ) : (
        <p style={{ textAlign: "center", color: "var(--ink-500)", padding: 16 }}>
          Grup ini sudah {group.status === "completed" ? "selesai" : "dibatalkan"}.
        </p>
      )}
    </main>
  );
}
