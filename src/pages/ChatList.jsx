import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";

function formatChatTime(value) {
  if (!value) return "";
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
}

export default function ChatList() {
  const { user } = useAuth();
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return undefined;
    let active = true;

    async function load() {
      const { data: rawThreads } = await supabase
        .from("chat_threads")
        .select("*, product:products(name, image_url)")
        .or(`user_a.eq.${user.id},user_b.eq.${user.id}`)
        .order("created_at", { ascending: false });
      const list = rawThreads || [];
      const ids = list.map((thread) => thread.id);
      if (!ids.length) {
        if (active) { setThreads([]); setLoading(false); }
        return;
      }

      const [{ data: profiles }, { data: messages }, { data: notifications }] = await Promise.all([
        supabase.from("profiles").select("id, display_name, avatar_url, is_verified, is_owner").in("id", [...new Set(list.flatMap((thread) => [thread.user_a, thread.user_b]))]),
        supabase.from("chat_messages").select("id, thread_id, content, sender_id, created_at, attachment_type").in("thread_id", ids).order("created_at", { ascending: false }),
        supabase.from("chat_notifications").select("id, thread_id").eq("recipient_id", user.id).is("read_at", null).in("thread_id", ids),
      ]);
      const profileMap = new Map((profiles || []).map((profile) => [profile.id, profile]));
      const latestMap = new Map();
      (messages || []).forEach((message) => { if (!latestMap.has(message.thread_id)) latestMap.set(message.thread_id, message); });
      const unreadMap = new Map();
      (notifications || []).forEach((notification) => unreadMap.set(notification.thread_id, (unreadMap.get(notification.thread_id) || 0) + 1));
      const next = list.map((thread) => {
        const participantId = thread.user_a === user.id ? thread.user_b : thread.user_a;
        const latest = latestMap.get(thread.id);
        return { ...thread, participant: profileMap.get(participantId), latest, unreadCount: unreadMap.get(thread.id) || 0 };
      }).sort((a, b) => new Date(b.latest?.created_at || b.created_at) - new Date(a.latest?.created_at || a.created_at));
      if (active) { setThreads(next); setLoading(false); }
    }

    load();
    const channel = supabase.channel(`chat_inbox_${user.id}`).on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, load).subscribe();
    return () => { active = false; supabase.removeChannel(channel); };
  }, [user]);

  if (!user) return <main className="container empty-state"><h2>Masuk untuk melihat chat</h2><p>Login dengan Google untuk mulai chat dengan penjual atau pembeli.</p></main>;

  return (
    <main className="container chat-inbox-page">
      <div className="chat-list-heading"><div><span className="section-kicker">Percakapan</span><h1 className="page-title">Chat</h1></div><span className="chat-list-status">Aman dan langsung</span></div>
      {loading ? <div className="skeleton" style={{ height: 260 }} /> : !threads.length ? (
        <div className="empty-state"><p>Belum ada percakapan. Mulai chat dari halaman produk.</p></div>
      ) : (
        <div className="chat-thread-list">
          {threads.map((thread) => (
            <Link key={thread.id} to={`/chat/${thread.id}`} className="chat-thread-row">
              <div className="chat-thread-avatar">
                {thread.participant?.avatar_url ? <img src={thread.participant.avatar_url} alt="" /> : <span>{thread.participant?.display_name?.[0] || "U"}</span>}
              </div>
              <div className="chat-thread-main">
                <div className="chat-thread-title-row"><strong>{thread.participant?.display_name || "Pengguna"}</strong><time>{formatChatTime(thread.latest?.created_at || thread.created_at)}</time></div>
                <div className="chat-thread-product">{thread.product?.name || "Percakapan umum"}</div>
                <p>{thread.latest?.attachment_type === "image" ? "Gambar" : thread.latest?.attachment_type === "video" ? "Video" : thread.latest?.content || "Belum ada pesan"}</p>
              </div>
              {thread.unreadCount > 0 && <span className="chat-unread-badge">{thread.unreadCount > 99 ? "99+" : thread.unreadCount}</span>}
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
