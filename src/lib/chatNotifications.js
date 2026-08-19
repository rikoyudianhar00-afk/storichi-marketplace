import { useEffect, useState } from "react";
import { supabase } from "./supabase";

export function useUnreadChatNotifications(userId) {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!userId) {
      setUnreadCount(0);
      return undefined;
    }

    let active = true;
    supabase
      .from("chat_notifications")
      .select("id", { count: "exact", head: true })
      .eq("recipient_id", userId)
      .is("read_at", null)
      .then(({ count }) => {
        if (active) setUnreadCount(count || 0);
      });

    const channel = supabase
      .channel(`chat_notifications_${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_notifications", filter: `recipient_id=eq.${userId}` },
        () => setUnreadCount((current) => current + 1)
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [userId]);

  return unreadCount;
}

export async function markChatThreadRead(userId, threadId) {
  if (!userId || !threadId) return;
  await supabase
    .from("chat_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_id", userId)
    .eq("thread_id", threadId)
    .is("read_at", null);
}
