import test from "node:test";
import assert from "node:assert/strict";
import handler from "../api/ai.js";

function request(body) {
  return {
    method: "POST",
    body,
    headers: { "x-forwarded-for": "203.0.113.17" },
    socket: { remoteAddress: "203.0.113.17" },
  };
}

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

test("gateway mengembalikan ID produk dan toko publik yang valid", async () => {
  const previousFetch = global.fetch;
  const previousEnv = {
    STORICHI_AI_API_KEY: process.env.STORICHI_AI_API_KEY,
    STORICHI_AI_BASE_URL: process.env.STORICHI_AI_BASE_URL,
    STORICHI_AI_MODEL: process.env.STORICHI_AI_MODEL,
    VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL,
    VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY,
  };
  process.env.STORICHI_AI_API_KEY = "test-key";
  process.env.STORICHI_AI_BASE_URL = "https://generativelanguage.googleapis.com";
  process.env.STORICHI_AI_MODEL = "Gemini 3.5 Flash Lite";
  process.env.VITE_SUPABASE_URL = "https://example.supabase.co";
  process.env.VITE_SUPABASE_ANON_KEY = "public-test-key";
  global.fetch = async (url) => {
    if (String(url).includes("/rest/v1/products")) return new Response(JSON.stringify([
      { id: "produk-1", slug: "top-up-aman", name: "Top Up Aman", category: "Top Up", seller_id: "toko-1", stock: 2, sales_count: 5 },
    ]), { status: 200, headers: { "Content-Type": "application/json" } });
    if (String(url).includes("/rest/v1/profiles")) return new Response(JSON.stringify([
      { id: "toko-1", display_name: "Toko Aman", bio: "Seller publik", is_verified: true },
    ]), { status: 200, headers: { "Content-Type": "application/json" } });
    return new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: "Saya menemukan pilihan yang relevan.\n[PRODUCT_IDS:produk-1]\n[STORE_IDS:toko-1]" }] } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  try {
    const res = response();
    await handler(request({
      message: "Cari top up dari Toko Aman",
      catalog: [{ id: "tidak-boleh-dipakai", name: "Data browser lama" }],
    }), res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body.productIds, ["produk-1"]);
    assert.deepEqual(res.body.storeIds, ["toko-1"]);
    assert.equal(res.body.catalogCount, 1);
    assert.equal(res.body.storeCount, 1);
    assert.doesNotMatch(res.body.answer, /\[(?:PRODUCT|STORE)_IDS:/i);
  } finally {
    global.fetch = previousFetch;
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
