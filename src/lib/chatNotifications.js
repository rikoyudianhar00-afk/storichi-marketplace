import { useEffect, useState } from "react";
import { supabase } from "./supabase";

async function getUnreadCount(userId) {
  if (!userId) return 0;
  const { data } = await supabase
    .from("chat_notifications")
    .select("thread_id")
    .eq("recipient_id", userId)
    .is("read_at", null);
  return new Set((data || []).map((notification) => notification.thread_id)).size;
}

export function useUnreadChatNotifications(userId) {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!userId) {
      setUnreadCount(0);
      return undefined;
    }

    let active = true;
    const refresh = async () => {
      const count = await getUnreadCount(userId);
      if (active) setUnreadCount(count);
    };

    refresh();
    const onLocalChange = () => refresh();
    window.addEventListener("chat-notifications-updated", onLocalChange);

    const channel = supabase
      .channel(`chat_notifications_${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chat_notifications", filter: `recipient_id=eq.${userId}` },
        refresh
      )
      .subscribe();

    return () => {
      active = false;
      window.removeEventListener("chat-notifications-updated", onLocalChange);
      supabase.removeChannel(channel);
    };
  }, [userId]);

  return unreadCount;
}

export async function markChatThreadRead(userId, threadId) {
  if (!userId || !threadId) return 0;
  const [{ data, error }, { error: messageReadError }] = await Promise.all([
    supabase
      .from("chat_notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("recipient_id", userId)
      .eq("thread_id", threadId)
      .is("read_at", null)
      .select("id"),
    supabase.rpc("mark_chat_thread_messages_read", { p_thread_id: threadId }),
  ]);
  if (!error && !messageReadError) window.dispatchEvent(new Event("chat-notifications-updated"));
  return data?.length || 0;
}

export async function markChatNotificationRead(userId, notificationId) {
  if (!userId || !notificationId) return false;
  const { error } = await supabase
    .from("chat_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_id", userId)
    .eq("id", notificationId)
    .is("read_at", null);
  if (!error) window.dispatchEvent(new Event("chat-notifications-updated"));
  return !error;
}
