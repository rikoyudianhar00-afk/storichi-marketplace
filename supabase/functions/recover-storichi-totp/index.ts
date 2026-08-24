import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const projectUrl = Deno.env.get("SUPABASE_URL") ?? "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const allowedOrigin = "https://storichi-marketplace.vercel.app";

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

async function requireUser(request: Request) {
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return { error: "Sesi website tidak ditemukan." };
  const client = createClient(projectUrl, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return { error: "Sesi website tidak valid." };
  return { user: data.user };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, { error: "Method tidak didukung." }, 405);
  if (!projectUrl || !anonKey || !serviceRoleKey) return json(request, { error: "Konfigurasi autentikasi server belum lengkap." }, 500);

  const body = await request.json().catch(() => null);
  if (body?.action !== "recover") return json(request, { error: "Aksi pemulihan tidak valid." }, 400);

  const session = await requireUser(request);
  if ("error" in session) return json(request, { error: session.error }, 401);

  const admin = createClient(projectUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await admin.auth.admin.mfa.listFactors({ userId: session.user.id });
  if (error) return json(request, { error: "Faktor autentikator belum dapat diperiksa." }, 500);

  const staleFactors = (data?.factors ?? []).filter((factor) => factor.factor_type === "totp" && factor.status !== "verified");
  for (const factor of staleFactors) {
    const { error: deleteError } = await admin.auth.admin.mfa.deleteFactor({ id: factor.id, userId: session.user.id });
    if (deleteError) return json(request, { error: "Aktivasi lama belum dapat dipulihkan." }, 500);
  }

  return json(request, { removed: staleFactors.length });
});
