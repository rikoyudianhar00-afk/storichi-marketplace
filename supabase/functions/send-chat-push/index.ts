import webpush from "npm:web-push@3.6.7";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const webhookSecret = Deno.env.get("PUSH_WEBHOOK_SECRET");
const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY")!;
const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY")!;
const vapidSubject = Deno.env.get("VAPID_SUBJECT") || "mailto:owner@example.com";

if (vapidPublicKey && vapidPrivateKey) webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
const supabase = createClient(supabaseUrl, serviceRoleKey);

async function sendExpoPush(tokens: string[], title: string, body: string, url: string, threadId: string) {
  if (!tokens.length) return { delivered: 0, staleTokens: [] as string[] };
  const response = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { Accept: "application/json", "Accept-Encoding": "gzip, deflate", "Content-Type": "application/json" },
    body: JSON.stringify(tokens.slice(0, 100).map((to) => ({ to, title, body, sound: "default", priority: "high", channelId: "storichi-messages", data: { type: "chat", threadId, url } }))),
  });
  if (!response.ok) throw new Error(`Expo Push Service ${response.status}`);
  const result = await response.json();
  const entries = Array.isArray(result?.data) ? result.data : [];
  const staleTokens = entries.flatMap((entry: { details?: { error?: string } }, index: number) => entry?.details?.error === "DeviceNotRegistered" ? [tokens[index]] : []);
  return { delivered: entries.filter((entry: { status?: string }) => entry?.status === "ok").length, staleTokens };
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  if (!webhookSecret) return new Response("PUSH_WEBHOOK_SECRET is not configured", { status: 500 });
  if (request.headers.get("x-push-webhook-secret") !== webhookSecret) return new Response("Unauthorized", { status: 401 });
  if (!vapidPublicKey || !vapidPrivateKey) return new Response("VAPID keys are not configured", { status: 500 });

  const body = await request.json();
  const notification = body.record || body;
  if (!notification?.recipient_id || !notification?.message_id) return Response.json({ skipped: true });

  const [{ data: message }, { data: recipientSubscriptions }, { data: mobileTokens }] = await Promise.all([
    supabase.from("chat_messages").select("content, sender_id, attachment_type").eq("id", notification.message_id).maybeSingle(),
    supabase.from("push_subscriptions").select("id, endpoint, subscription").eq("user_id", notification.recipient_id),
    supabase.from("mobile_push_tokens").select("expo_push_token").eq("user_id", notification.recipient_id),
  ]);
  if (!recipientSubscriptions?.length && !mobileTokens?.length) return Response.json({ delivered: 0 });

  const { data: sender } = message?.sender_id
    ? await supabase.from("profiles").select("display_name").eq("id", message.sender_id).maybeSingle()
    : { data: null };
  const payload = JSON.stringify({
    title: sender?.display_name ? `${sender.display_name} mengirim pesan` : "Pesan baru di Storichi",
    body: message?.attachment_type === "image" ? "Mengirim gambar" : message?.attachment_type === "video" ? "Mengirim video" : message?.content || "Kamu menerima pesan baru.",
    notificationId: notification.id,
    threadId: notification.thread_id,
    url: `/chat/${notification.thread_id}`,
  });

  let delivered = 0;
  for (const item of recipientSubscriptions) {
    try {
      await webpush.sendNotification(item.subscription, payload);
      delivered += 1;
    } catch (error) {
      console.error("Web Push delivery failed", { subscriptionId: item.id, statusCode: error?.statusCode, message: error?.message });
      if (error?.statusCode === 404 || error?.statusCode === 410) {
        await supabase.from("push_subscriptions").delete().eq("id", item.id);
      }
    }
  }
  const mobilePushTokens = (mobileTokens || []).map((item) => item.expo_push_token).filter((token): token is string => /^ExponentPushToken\[[^\]]+\]$/.test(token));
  const mobileResult = await sendExpoPush(mobilePushTokens, sender?.display_name ? `${sender.display_name} mengirim pesan` : "Pesan baru di Storichi", message?.attachment_type === "image" ? "Mengirim gambar" : message?.attachment_type === "video" ? "Mengirim video" : message?.content || "Kamu menerima pesan baru.", `/chat/${notification.thread_id}`, notification.thread_id).catch((error) => {
    console.error("Native push delivery failed", error);
    return { delivered: 0, staleTokens: [] as string[] };
  });
  if (mobileResult.staleTokens.length) await supabase.from("mobile_push_tokens").delete().in("expo_push_token", mobileResult.staleTokens);
  return Response.json({ delivered: delivered + mobileResult.delivered, webDelivered: delivered, mobileDelivered: mobileResult.delivered });
});
