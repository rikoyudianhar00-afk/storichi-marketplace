import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, serviceRoleKey);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

async function sendExpoPush(tokens: string[], title: string, body: string, url: string) {
  if (!tokens.length) return { delivered: 0, staleTokens: [] as string[] };
  const response = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { Accept: "application/json", "Accept-Encoding": "gzip, deflate", "Content-Type": "application/json" },
    body: JSON.stringify(tokens.slice(0, 100).map((to) => ({ to, title, body, sound: "default", priority: "high", channelId: "storichi-messages", data: { type: "rekber-invitation", url } }))),
  });
  if (!response.ok) throw new Error(`Expo Push Service ${response.status}`);
  const result = await response.json();
  const entries = Array.isArray(result?.data) ? result.data : [];
  const staleTokens = entries.flatMap((entry: { details?: { error?: string } }, index: number) => entry?.details?.error === "DeviceNotRegistered" ? [tokens[index]] : []);
  return { delivered: entries.filter((entry: { status?: string }) => entry?.status === "ok").length, staleTokens };
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "Method Not Allowed" }, 405);
  const authorization = request.headers.get("Authorization") || "";
  const accessToken = authorization.replace(/^Bearer\s+/i, "");
  if (!accessToken) return json({ error: "Unauthorized" }, 401);

  const { data: authData } = await supabase.auth.getUser(accessToken);
  const actorId = authData?.user?.id;
  const invitationId = (await request.json().catch(() => ({})))?.invitationId;
  if (!actorId || typeof invitationId !== "string") return json({ error: "Unauthorized" }, 401);

  const { data: invitation } = await supabase
    .from("rekber_invitations")
    .select("id, inviter_id, buyer_id, seller_id, third_party_id, third_party_kind, status, purchase_request:purchase_requests(thread_id)")
    .eq("id", invitationId)
    .maybeSingle();
  if (!invitation) return json({ error: "Undangan tidak ditemukan" }, 404);

  const isInitialInvite = actorId === invitation.seller_id && invitation.status === "pending";
  const isBuyerApproval = actorId === invitation.buyer_id && invitation.status === "buyer_approved";
  if (!isInitialInvite && !isBuyerApproval) return json({ error: "Tidak berwenang mengirim notifikasi undangan ini" }, 403);

  const recipientId = invitation.status === "pending" && invitation.third_party_kind === "regular"
    ? invitation.buyer_id
    : invitation.third_party_id;
  const { data: tokens } = await supabase.from("mobile_push_tokens").select("expo_push_token").eq("user_id", recipientId);
  const pushTokens = (tokens || []).map((row) => row.expo_push_token).filter((token): token is string => /^ExponentPushToken\[[^\]]+\]$/.test(token));
  const threadId = invitation.purchase_request?.thread_id;
  const url = threadId ? `/chat/${threadId}` : "/rekber";
  const message = invitation.status === "pending" && invitation.third_party_kind === "regular"
    ? "Seller mengajukan Midman (MM). Tinjau dan setujui bila sesuai."
    : "Anda menerima undangan Rekber. Buka untuk meninjau prosesnya.";
  const result = await sendExpoPush(pushTokens, "Undangan Rekber Storichi", message, url);
  if (result.staleTokens.length) await supabase.from("mobile_push_tokens").delete().in("expo_push_token", result.staleTokens);
  return json({ delivered: result.delivered });
});
