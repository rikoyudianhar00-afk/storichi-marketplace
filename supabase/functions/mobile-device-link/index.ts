import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const projectUrl = Deno.env.get("SUPABASE_URL") ?? "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const allowedOrigin = "https://storichi-marketplace.vercel.app";
const validCode = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{12}$/;

function corsHeaders(request: Request) {
  const origin = request.headers.get("origin");
  return {
    "Access-Control-Allow-Origin": origin === allowedOrigin ? origin : allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    Vary: "Origin",
  };
}

function json(request: Request, body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(request) });
}

function normalizeCode(value: unknown) {
  return String(value ?? "").toUpperCase().replace(/[^A-Z2-9]/g, "");
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function createCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

async function requireAal2(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!token) return { error: "Sesi website tidak ditemukan." };

  const userClient = createClient(projectUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const [{ data: userData, error: userError }, { data: assuranceData, error: assuranceError }] = await Promise.all([
    userClient.auth.getUser(token),
    userClient.auth.mfa.getAuthenticatorAssuranceLevel(token),
  ]);

  if (userError || !userData.user) return { error: "Sesi website tidak valid." };
  if (assuranceError || assuranceData?.currentLevel !== "aal2") {
    return { error: "Masukkan kode dari aplikasi autentikator terlebih dahulu." };
  }
  return { user: userData.user };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, { error: "Method tidak didukung." }, 405);
  if (!projectUrl || !anonKey || !serviceRoleKey) return json(request, { error: "Konfigurasi autentikasi server belum lengkap." }, 500);

  let body: { action?: string; code?: string };
  try {
    body = await request.json();
  } catch {
    return json(request, { error: "Permintaan tidak valid." }, 400);
  }

  const admin = createClient(projectUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

  if (body.action === "create") {
    const result = await requireAal2(request);
    if ("error" in result) return json(request, { error: result.error }, 401);

    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const code = createCode();
      const { error } = await admin.from("mobile_device_links").insert({
        user_id: result.user.id,
        code_hash: await sha256(code),
        expires_at: expiresAt,
      });
      if (!error) return json(request, { code, expiresAt });
      if (attempt === 2) return json(request, { error: "Kunci perangkat belum dapat dibuat." }, 500);
    }
  }

  if (body.action === "claim") {
    const code = normalizeCode(body.code);
    if (!validCode.test(code)) return json(request, { error: "Format kunci autentikasi tidak valid." }, 400);

    const { data: userId, error: claimError } = await admin.rpc("claim_mobile_device_link", { p_code_hash: await sha256(code) });
    if (claimError || !userId) return json(request, { error: "Kunci tidak valid, sudah dipakai, atau telah berakhir." }, 401);

    const { data: userResult, error: userError } = await admin.auth.admin.getUserById(userId);
    if (userError || !userResult.user?.email) return json(request, { error: "Akun tidak dapat dipersiapkan untuk perangkat ini." }, 500);

    const { data: linkResult, error: linkError } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: userResult.user.email,
    });
    const tokenHash = linkResult?.properties?.hashed_token;
    if (linkError || !tokenHash) return json(request, { error: "Sesi perangkat belum dapat dibuat." }, 500);
    return json(request, { tokenHash });
  }

  return json(request, { error: "Aksi tidak valid." }, 400);
});
