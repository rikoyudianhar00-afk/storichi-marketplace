import { useEffect, useState } from "react";
import { supabase } from "./supabase";

export async function countUnreadNotifications(userId) {
  if (!userId) return 0;
  const [{ count: generalCount }, { count: chatCount }] = await Promise.all([
    supabase.from("user_notifications").select("id", { count: "exact", head: true }).eq("recipient_id", userId).is("read_at", null),
    supabase.from("chat_notifications").select("id", { count: "exact", head: true }).eq("recipient_id", userId).is("read_at", null),
  ]);
  return Number(generalCount || 0) + Number(chatCount || 0);
}

export function useUnreadNotifications(userId) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!userId) {
      setCount(0);
      return undefined;
    }
    let active = true;
    const refresh = async () => {
      const next = await countUnreadNotifications(userId);
      if (active) setCount(next);
    };
    refresh();
    const channel = supabase.channel(`notification_center_${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "user_notifications", filter: `recipient_id=eq.${userId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_notifications", filter: `recipient_id=eq.${userId}` }, refresh)
      .subscribe();
    window.addEventListener("notifications-updated", refresh);
    return () => {
      active = false;
      window.removeEventListener("notifications-updated", refresh);
      supabase.removeChannel(channel);
    };
  }, [userId]);
  return count;
}

export async function markAllNotificationsRead(userId) {
  if (!userId) return;
  await Promise.all([
    supabase.from("user_notifications").update({ read_at: new Date().toISOString() }).eq("recipient_id", userId).is("read_at", null),
    supabase.from("chat_notifications").update({ read_at: new Date().toISOString() }).eq("recipient_id", userId).is("read_at", null),
  ]);
  window.dispatchEvent(new Event("notifications-updated"));
}
