import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, serviceRoleKey);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

type PushEvent =
  | { event: "chat-message"; messageId: string }
  | { event: "purchase-decision"; purchaseRequestId: string }
  | { event: "direct-rating-request"; purchaseRequestId: string }
  | { event: "rekber-custody-request"; groupId: string }
  | { event: "rekber-party-done"; groupId: string }
  | { event: "rekber-rating-request"; groupId: string }
  | { event: "rekber-buyer-decision"; invitationId: string };

type Notice = {
  recipients: string[];
  actorId: string;
  title: string;
  body: string;
  href: string;
  type: string;
  entityId?: string;
};

function isExpoPushToken(value: unknown): value is string {
  return typeof value === "string" && /^ExponentPushToken\[[^\]]+\]$/.test(value);
}

async function resolveNotice(event: PushEvent, actorId: string): Promise<Notice | null> {
  if (event.event === "chat-message") {
    const { data: message } = await supabase
      .from("chat_messages")
      .select("id, thread_id, sender_id, content, attachment_type")
      .eq("id", event.messageId)
      .maybeSingle();
    if (!message || message.sender_id !== actorId) return null;

    const { data: recipients } = await supabase
      .from("chat_notifications")
      .select("recipient_id")
      .eq("message_id", message.id);
    const recipientIds = [...new Set((recipients || []).map((row) => row.recipient_id).filter((id) => id && id !== actorId))];
    if (!recipientIds.length) return null;

    const { data: actor } = await supabase.from("profiles").select("display_name").eq("id", actorId).maybeSingle();
    return {
      recipients: recipientIds,
      actorId,
      title: actor?.display_name ? `${actor.display_name} mengirim pesan` : "Pesan baru di Storichi",
      body: message.attachment_type === "image" ? "Mengirim gambar" : message.attachment_type === "video" ? "Mengirim video" : message.content || "Kamu menerima pesan baru.",
      href: `/chat/${message.thread_id}`,
      type: "chat_message",
      entityId: message.id,
    };
  }

  if (event.event === "purchase-decision" || event.event === "direct-rating-request") {
    const { data: request } = await supabase
      .from("purchase_requests")
      .select("id, thread_id, buyer_id, seller_id, status")
      .eq("id", event.purchaseRequestId)
      .maybeSingle();
    if (!request || request.seller_id !== actorId) return null;
    const approved = request.status === "approved";
    return {
      recipients: [request.buyer_id],
      actorId,
      title: event.event === "purchase-decision" ? (approved ? "Permintaan pembelian disetujui" : "Permintaan pembelian diperbarui") : "Rating produk diminta",
      body: event.event === "purchase-decision" ? (approved ? "Seller menyetujui permintaan pembelian Anda. Pilih proses transaksi berikutnya." : "Seller telah memperbarui status permintaan pembelian Anda.") : "Seller meminta Anda memberi rating produk untuk melanjutkan transaksi.",
      href: `/chat/${request.thread_id}`,
      type: event.event === "purchase-decision" ? "purchase_decision" : "rating_request",
      entityId: request.id,
    };
  }

  if (event.event === "rekber-buyer-decision") {
    const { data: invitation } = await supabase
      .from("rekber_invitations")
      .select("id, buyer_id, seller_id, status, purchase_request:purchase_requests(thread_id)")
      .eq("id", event.invitationId)
      .maybeSingle();
    if (!invitation || invitation.buyer_id !== actorId) return null;
    const threadId = invitation.purchase_request?.thread_id;
    if (!threadId) return null;
    return {
      recipients: [invitation.seller_id],
      actorId,
      title: invitation.status === "buyer_approved" ? "Buyer menyetujui Midman (MM)" : "Buyer menolak pengajuan Midman (MM)",
      body: invitation.status === "buyer_approved" ? "Undangan dapat diteruskan kepada Midman (MM)." : "Pilih Midman (MM) lain untuk melanjutkan Rekber.",
      href: `/chat/${threadId}`,
      type: "rekber_buyer_decision",
      entityId: invitation.id,
    };
  }

  const { data: group } = await supabase
    .from("rekber_groups")
    .select("id, purchase_request_id, buyer_id, seller_id, third_party_id, purchase_request:purchase_requests(thread_id)")
    .eq("id", event.groupId)
    .maybeSingle();
  if (!group || !group.purchase_request?.thread_id) return null;
  const href = `/chat/${group.purchase_request.thread_id}`;

  if (event.event === "rekber-custody-request") {
    if (group.third_party_id !== actorId) return null;
    return { recipients: [group.buyer_id, group.seller_id], actorId, title: "Persetujuan Rekber diperlukan", body: "Midman (MM) meminta persetujuan Seller dan Buyer untuk menyelesaikan pengamanan dana/item.", href, type: "rekber_custody_request", entityId: group.id };
  }
  if (event.event === "rekber-party-done") {
    if (actorId !== group.buyer_id && actorId !== group.seller_id) return null;
    return { recipients: [group.third_party_id], actorId, title: "Persetujuan Rekber diterima", body: "Salah satu pihak telah menyetujui penyelesaian transaksi Rekber.", href, type: "rekber_party_done", entityId: group.id };
  }
  if (event.event === "rekber-rating-request") {
    if (group.third_party_id !== actorId) return null;
    return { recipients: [group.buyer_id, group.seller_id], actorId, title: "Rating Midman (MM) diperlukan", body: "Midman (MM) meminta rating sebelum custody dapat diselesaikan.", href, type: "rekber_rating_request", entityId: group.id };
  }
  return null;
}

async function notifyMobile(notice: Notice) {
  const recipients = [...new Set(notice.recipients.filter(Boolean).filter((id) => id !== notice.actorId))];
  if (!recipients.length) return { delivered: 0 };

  await supabase.from("user_notifications").insert(recipients.map((recipientId) => ({
    recipient_id: recipientId,
    actor_id: notice.actorId,
    type: notice.type,
    title: notice.title,
    body: notice.body,
    href: notice.href,
    entity_id: notice.entityId || null,
  })));

  const { data: rows } = await supabase
    .from("mobile_push_tokens")
    .select("id, expo_push_token")
    .in("user_id", recipients);
  const tokens = (rows || []).filter((row) => isExpoPushToken(row.expo_push_token));
  if (!tokens.length) return { delivered: 0 };

  const response = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { Accept: "application/json", "Accept-Encoding": "gzip, deflate", "Content-Type": "application/json" },
    body: JSON.stringify(tokens.slice(0, 100).map((row) => ({
      to: row.expo_push_token,
      title: notice.title,
      body: notice.body,
      sound: "default",
      priority: "high",
      channelId: "storichi-messages",
      data: { type: notice.type, url: notice.href },
    }))),
  });
  if (!response.ok) return { delivered: 0 };
  const result = await response.json();
  const tickets = Array.isArray(result?.data) ? result.data : [];
  const invalidIds = tokens
    .filter((row, index) => tickets[index]?.status === "error" && tickets[index]?.details?.error === "DeviceNotRegistered")
    .map((row) => row.id);
  if (invalidIds.length) await supabase.from("mobile_push_tokens").delete().in("id", invalidIds);
  return { delivered: tickets.filter((ticket: { status?: string }) => ticket.status === "ok").length };
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "Method Not Allowed" }, 405);
  const accessToken = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: auth } = await supabase.auth.getUser(accessToken);
  if (!auth.user?.id) return json({ error: "Unauthorized" }, 401);

  const event = await request.json().catch(() => null) as PushEvent | null;
  if (!event?.event) return json({ error: "Event tidak valid" }, 400);
  const notice = await resolveNotice(event, auth.user.id);
  if (!notice) return json({ skipped: true });
  const result = await notifyMobile(notice);
  return json({ skipped: false, ...result });
});
