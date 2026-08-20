import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function ChatNotificationToast({ userId }) {
  const [toast, setToast] = useState(null);
  const seenNotifications = useRef(new Set());

  useEffect(() => {
    if (!userId) {
      setToast(null);
      return undefined;
    }

    let timer;
    seenNotifications.current.clear();
    const channel = supabase
      .channel(`chat_toast_${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_notifications", filter: `recipient_id=eq.${userId}` },
        async (payload) => {
          const notification = payload.new;
          if (!notification?.id || seenNotifications.current.has(notification.id)) return;
          seenNotifications.current.add(notification.id);
          if (seenNotifications.current.size > 100) seenNotifications.current.delete(seenNotifications.current.values().next().value);
          const [{ data: message }, { data: thread }] = await Promise.all([
            supabase.from("chat_messages").select("content, sender_id, attachment_type").eq("id", notification.message_id).maybeSingle(),
            supabase.from("chat_threads").select("product:products(name)").eq("id", notification.thread_id).maybeSingle(),
          ]);
          const { data: sender } = message?.sender_id
            ? await supabase.from("profiles").select("display_name, avatar_url").eq("id", message.sender_id).maybeSingle()
            : { data: null };
          setToast({
            id: notification.id,
            threadId: notification.thread_id,
            senderName: sender?.display_name || "Pesan baru",
            avatarUrl: sender?.avatar_url,
            productName: thread?.product?.name,
            preview: message?.attachment_type === "image" ? "Mengirim gambar" : message?.attachment_type === "video" ? "Mengirim video" : message?.content || "Pesan baru",
          });
          window.clearTimeout(timer);
          timer = window.setTimeout(() => setToast(null), 7000);
        }
      )
      .subscribe();

    return () => {
      window.clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [userId]);

  if (!toast) return null;

  return (
    <div className="chat-notification-toast" role="status" aria-live="polite">
      <div className="chat-notification-avatar">
        {toast.avatarUrl ? <img src={toast.avatarUrl} alt="" /> : <span>{toast.senderName[0]}</span>}
      </div>
      <Link to={`/chat/${toast.threadId}`} onClick={() => setToast(null)} className="chat-notification-content">
        <strong>{toast.senderName}</strong>
        {toast.productName && <small>{toast.productName}</small>}
        <span>{toast.preview}</span>
      </Link>
      <button type="button" className="chat-notification-close" onClick={() => setToast(null)} aria-label="Tutup notifikasi">×</button>
    </div>
  );
}
