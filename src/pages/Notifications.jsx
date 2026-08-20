import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import { markAllNotificationsRead } from "../lib/notifications";

function relativeDate(value) {
  if (!value) return "";
  const diff = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Baru saja";
  if (minutes < 60) return `${minutes} menit lalu`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;
  const days = Math.floor(hours / 24);
  return days < 7 ? `${days} hari lalu` : new Date(value).toLocaleDateString("id-ID");
}

export default function Notifications() {
  const { user, signInWithGoogle } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setItems([]);
      setLoading(false);
      return undefined;
    }
    let active = true;
    async function load() {
      const [{ data: general }, { data: chatRows }] = await Promise.all([
        supabase.from("user_notifications").select("id, type, title, body, href, read_at, created_at, actor:actor_id(display_name, avatar_url)").eq("recipient_id", user.id).order("created_at", { ascending: false }).limit(50),
        supabase.from("chat_notifications").select("id, thread_id, message_id, read_at, created_at").eq("recipient_id", user.id).order("created_at", { ascending: false }).limit(50),
      ]);
      const messageIds = (chatRows || []).map((row) => row.message_id).filter(Boolean);
      const threadIds = (chatRows || []).map((row) => row.thread_id).filter(Boolean);
      const [{ data: messages }, { data: threads }] = await Promise.all([
        messageIds.length ? supabase.from("chat_messages").select("id, content, sender_id, attachment_type").in("id", messageIds) : Promise.resolve({ data: [] }),
        threadIds.length ? supabase.from("chat_threads").select("id, product:products(name)").in("id", threadIds) : Promise.resolve({ data: [] }),
      ]);
      const senderIds = [...new Set((messages || []).map((message) => message.sender_id).filter(Boolean))];
      const { data: senders } = senderIds.length ? await supabase.from("profiles").select("id, display_name, avatar_url").in("id", senderIds) : { data: [] };
      const messageMap = new Map((messages || []).map((message) => [message.id, message]));
      const threadMap = new Map((threads || []).map((thread) => [thread.id, thread]));
      const senderMap = new Map((senders || []).map((sender) => [sender.id, sender]));
      const genericItems = (general || []).map((notification) => ({ ...notification, kind: "general", link: notification.href || "/notifikasi" }));
      const chatItems = (chatRows || []).map((notification) => {
        const message = messageMap.get(notification.message_id);
        const sender = senderMap.get(message?.sender_id);
        const thread = threadMap.get(notification.thread_id);
        return { ...notification, kind: "chat", title: sender?.display_name || "Pesan baru", body: message?.attachment_type === "image" ? "Mengirim gambar" : message?.content || "Mengirim pesan", subtitle: thread?.product?.name, link: `/chat/${notification.thread_id}` };
      });
      if (active) {
        setItems([...genericItems, ...chatItems].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
        setLoading(false);
      }
    }
    load();
    markAllNotificationsRead(user.id);
    const channel = supabase.channel(`notification_page_${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "user_notifications", filter: `recipient_id=eq.${user.id}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_notifications", filter: `recipient_id=eq.${user.id}` }, load)
      .subscribe();
    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [user]);

  if (!user) return <main className="container empty-state"><h1 className="page-title">Notifikasi</h1><p>Masuk untuk melihat notifikasi wishlist, rating, dan chat.</p><button type="button" className="btn btn-primary" onClick={signInWithGoogle}>Masuk</button></main>;

  return <main className="container notifications-page"><div className="notifications-heading"><div><span className="section-kicker">Pusat aktivitas</span><h1 className="page-title">Notifikasi</h1><p>Wishlist, penilaian, chat, dan aktivitas pentingmu.</p></div><span className="notifications-heart">♡</span></div>{loading ? <div className="skeleton" style={{ height: 220 }} /> : !items.length ? <div className="empty-state"><p>Belum ada notifikasi.</p></div> : <div className="notification-list">{items.map((item) => <Link className={`notification-item ${item.read_at ? "is-read" : ""} notification-${item.kind}`} to={item.link} key={`${item.kind}-${item.id}`}><span className="notification-icon">{item.kind === "chat" ? "⌁" : item.type === "wishlist_added" ? "♥" : item.type === "store_review_received" ? "★" : "☆"}</span><span className="notification-copy"><strong>{item.title}</strong>{item.subtitle && <small>{item.subtitle}</small>}<span>{item.body}</span><time>{relativeDate(item.created_at)}</time></span>{!item.read_at && <i aria-label="Belum dibaca" />}</Link>)}</div>}</main>;
}
