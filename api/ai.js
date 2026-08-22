const BLOCKED = [/(?:abaikan|ignore).{0,80}(?:instruksi|aturan|system|sistem|prompt)/i, /(?:jailbreak|prompt injection|developer message|system prompt)/i, /(?:spam|broadcast).{0,40}(?:chat|pesan|message)/i, /(?:rating|ulasan).{0,50}(?:palsu|fake|manipulasi|beli)/i, /(?:phishing|malware|keylogger|doxx|data pribadi|nomor kartu)/i, /(?:curi|bypass|retas|hack).{0,80}(?:akun|password|qr|qris|pembayaran)/i];
const attempts = new Map();
const GEMINI_MODEL_ALIASES = {
  "gemini 3.5 flash lite": "gemini-3.5-flash-lite",
  "gemini 3.5 flash-lite": "gemini-3.5-flash-lite",
  "gemini 3.5 flash": "gemini-3.5-flash",
  "gemini 2.5 flash lite": "gemini-2.5-flash-lite",
};
const SEARCH_STOP_WORDS = new Set(["aku", "anda", "apa", "atau", "bagi", "bisa", "buat", "cari", "dengan", "dan", "dari", "di", "ingin", "itu", "ke", "kami", "kamu", "mau", "paling", "produk", "saya", "sebuah", "serta", "toko", "untuk", "yang"]);
const DATABASE_PAGE_SIZE = 500;
const STORICHI_PUBLIC_SUPABASE_URL = "https://dzoveptvtpoybdwwciit.supabase.co";

function isGoogleGenerativeApi(baseUrl) {
  return /generativelanguage\.googleapis\.com|aiplatform\.googleapis\.com/i.test(baseUrl);
}

function cleanModelName(value) {
  const source = String(value || "").trim().replace(/^['"]|['"]$/g, "");
  const pathModel = source.match(/models\/([^:/?#]+)/i);
  if (pathModel?.[1]) return pathModel[1];
  const normalized = source.replace(/^models\//i, "").replace(/:generateContent.*$/i, "").split(/[?#]/)[0].trim();
  return GEMINI_MODEL_ALIASES[normalized.toLowerCase()] || normalized;
}

function getGoogleGenerateUrl(baseUrl, model) {
  const match = String(baseUrl).match(/^(https:\/\/[^/]*(?:generativelanguage|aiplatform)\.googleapis\.com)/i);
  const origin = match?.[1] || String(baseUrl).replace(/\/v1(?:beta)?\/.*$/i, "");
  return `${origin.replace(/\/$/, "")}/v1beta/models/${encodeURIComponent(model)}:generateContent`;
}

function getProviderDetail(raw) {
  let parsed = {};
  try { parsed = JSON.parse(raw); } catch { parsed = {}; }
  return String(parsed?.error?.message || parsed?.message || raw || "").replace(/(?:sk|key)-[A-Za-z0-9_-]+/gi, "[redacted]").replace(/\s+/g, " ").slice(0, 260);
}

function allowRequest(key) {
  const now = Date.now();
  const recent = (attempts.get(key) || []).filter((time) => now - time < 60_000);
  if (recent.length >= 8) return false;
  recent.push(now);
  attempts.set(key, recent);
  return true;
}

function normalize(value) {
  return String(value || "").toLocaleLowerCase("id").replace(/[^a-z0-9]+/g, " ").trim();
}

function searchTokens(value) {
  return [...new Set(normalize(value).split(" ").filter((token) => token.length > 1 && !SEARCH_STOP_WORDS.has(token)))];
}

function sanitizeProduct(product) {
  return {
    id: String(product.id || ""),
    slug: String(product.slug || ""),
    name: String(product.name || "").slice(0, 100),
    description: String(product.description || "").slice(0, 220),
    category: String(product.category || "").slice(0, 50),
    game_name: String(product.game_name || "").slice(0, 60),
    price_from: Number(product.price_from || 0),
    stock: Number(product.stock || 0),
    sales_count: Number(product.sales_count || 0),
    like_count: Number(product.like_count || 0),
    view_count: Number(product.view_count || 0),
    seller_id: String(product.seller_id || ""),
  };
}

function sanitizeStore(store, productCount) {
  return {
    id: String(store.id || ""),
    display_name: String(store.display_name || "").slice(0, 100),
    bio: String(store.bio || "").slice(0, 240),
    is_verified: Boolean(store.is_verified),
    is_midman: Boolean(store.is_midman),
    is_owner: Boolean(store.is_owner),
    product_count: Number(productCount || 0),
  };
}

function getSupabaseConfig(publicSupabase) {
  const url = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
  const anonKey = String(process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "");
  if (url && anonKey) return { url, anonKey };
  const browserUrl = String(publicSupabase?.url || "").replace(/\/$/, "");
  const browserKey = String(publicSupabase?.anonKey || "");
  if (browserUrl === STORICHI_PUBLIC_SUPABASE_URL && /^sb_publishable_[A-Za-z0-9_-]{20,}$/.test(browserKey)) return { url: browserUrl, anonKey: browserKey };
  return null;
}

async function fetchSupabaseJson(url, anonKey) {
  const response = await fetch(url, { headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` } });
  if (!response.ok) throw new Error(`Supabase public query failed: ${response.status}`);
  return response.json();
}

async function fetchAllPublicProducts(config) {
  const fields = "id,slug,name,description,category,game_name,price_from,stock,sales_count,like_count,view_count,seller_id";
  const rows = [];
  for (let offset = 0; ; offset += DATABASE_PAGE_SIZE) {
    const params = new URLSearchParams({ select: fields, is_active: "eq.true", stock: "gt.0", order: "sales_count.desc,like_count.desc", limit: String(DATABASE_PAGE_SIZE), offset: String(offset) });
    const page = await fetchSupabaseJson(`${config.url}/rest/v1/products?${params.toString()}`, config.anonKey);
    rows.push(...page.map(sanitizeProduct));
    if (page.length < DATABASE_PAGE_SIZE) return rows;
  }
}

async function fetchPublicStoresForProducts(config, products) {
  const sellerIds = [...new Set(products.map((product) => product.seller_id).filter(Boolean))];
  const productCounts = products.reduce((counts, product) => counts.set(product.seller_id, (counts.get(product.seller_id) || 0) + 1), new Map());
  const stores = [];
  for (let start = 0; start < sellerIds.length; start += 80) {
    const ids = sellerIds.slice(start, start + 80);
    const params = new URLSearchParams({ select: "id,display_name,bio,is_verified,is_midman,is_owner", id: `in.(${ids.join(",")})` });
    const page = await fetchSupabaseJson(`${config.url}/rest/v1/profiles?${params.toString()}`, config.anonKey);
    stores.push(...page.map((store) => sanitizeStore(store, productCounts.get(store.id))));
  }
  return stores.filter((store) => store.product_count > 0);
}

async function loadPublicMarketplaceContext(publicSupabase) {
  const config = getSupabaseConfig(publicSupabase);
  if (!config) throw new Error("Supabase server configuration unavailable");
  const products = await fetchAllPublicProducts(config);
  const stores = await fetchPublicStoresForProducts(config, products);
  return { products, stores };
}

function rankProducts(products, query) {
  const queryText = normalize(query);
  const tokens = searchTokens(query);
  return products.map((product) => {
    const searchable = normalize([product.name, product.description, product.category, product.game_name].join(" "));
    const tokenScore = tokens.reduce((score, token) => score + (searchable.includes(token) ? 18 : 0), 0);
    const exactScore = queryText && searchable.includes(queryText) ? 50 : 0;
    const popularity = Math.min(14, Math.log1p(product.sales_count) * 3 + Math.log1p(product.like_count));
    return { product, score: exactScore + tokenScore + popularity };
  }).sort((left, right) => right.score - left.score || right.product.sales_count - left.product.sales_count).slice(0, 100).map(({ product }) => product);
}

function rankStores(stores, query, relevantProducts) {
  const queryText = normalize(query);
  const tokens = searchTokens(query);
  const matchingSellers = new Set(relevantProducts.map((product) => product.seller_id).filter(Boolean));
  return stores.map((store) => {
    const searchable = normalize([store.display_name, store.bio, store.is_owner ? "owner" : "", store.is_verified ? "verified" : "", store.is_midman ? "midman" : ""].join(" "));
    const tokenScore = tokens.reduce((score, token) => score + (searchable.includes(token) ? 20 : 0), 0);
    const exactScore = queryText && searchable.includes(queryText) ? 45 : 0;
    const productMatchScore = matchingSellers.has(store.id) ? 20 : 0;
    const roleScore = store.is_owner ? 4 : store.is_verified ? 3 : store.is_midman ? 2 : 0;
    return { store, score: exactScore + tokenScore + productMatchScore + roleScore + Math.min(8, store.product_count) };
  }).sort((left, right) => right.score - left.score || left.store.display_name.localeCompare(right.store.display_name, "id")).slice(0, 60).map(({ store }) => store);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Gunakan POST." });
  const clientKey = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "anonymous").split(",")[0].trim();
  if (!allowRequest(clientKey)) return res.status(429).json({ error: "Terlalu banyak permintaan. Coba lagi sebentar." });
  const text = String(req.body?.message || "").trim();
  if (!text || text.length > 900) return res.status(400).json({ error: "Pesan harus berisi maksimal 900 karakter." });
  if (BLOCKED.some((pattern) => pattern.test(text))) return res.status(400).json({ error: "Permintaan tidak dapat diproses karena berisiko melanggar keamanan atau aturan marketplace." });
  const apiKey = process.env.STORICHI_AI_API_KEY || process.env.OPENAI_API_KEY;
  const baseUrl = String(process.env.STORICHI_AI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  if (!apiKey) return res.status(503).json({ error: "AI belum dikonfigurasi pada server." });

  let publicContext;
  try {
    publicContext = await loadPublicMarketplaceContext(req.body?.publicSupabase);
  } catch {
    return res.status(503).json({ error: "Katalog publik Storichi sedang tidak dapat dijangkau. Silakan coba lagi sebentar.", code: "PUBLIC_CATALOG_UNAVAILABLE" });
  }

  const isGoogle = isGoogleGenerativeApi(baseUrl);
  const model = cleanModelName(process.env.STORICHI_AI_MODEL || (isGoogle ? "gemini-3.5-flash-lite" : "gpt-5-mini"));
  const catalog = rankProducts(publicContext.products, text);
  const stores = rankStores(publicContext.stores, text, catalog);
  const system = `Anda adalah Asisten Storichi, marketplace digital Indonesia. Pahami sendiri konteks pengguna: mencari/membeli produk, mencari toko, menjual/membuat draft listing, atau bertanya tentang transaksi dan Rekber. Jawab dalam Bahasa Indonesia singkat, sopan, dan jujur. Anda hanya memberi saran dan draft. Jangan mengklaim telah mengirim chat, membuat listing, mengubah harga/stok, membeli produk, mengirim QRIS, memilih Midman, menyelesaikan Rekber/custody, memberi rating, atau menjalankan tindakan apa pun. Tolak penipuan, phishing, manipulasi ulasan, spam, permintaan data pribadi/rahasia, malware, dan usaha menghindari aturan. Rekomendasi produk hanya dari katalog publik database yang diberikan dan rekomendasi toko hanya dari toko publik database yang diberikan. Jangan meminta atau menebak email, QRIS, password, nomor telepon, isi chat, atau data privat. Jika menyarankan produk, keluarkan di akhir persis dalam format [PRODUCT_IDS:id1,id2] memakai ID katalog yang valid, atau [PRODUCT_IDS:] bila tidak ada. Jika menyarankan toko, keluarkan setelahnya persis dalam format [STORE_IDS:id1,id2] memakai ID toko yang valid, atau [STORE_IDS:] bila tidak ada.`;
  const userPrompt = `Katalog produk publik Storichi yang relevan:\n${JSON.stringify(catalog)}\n\nToko publik Storichi yang relevan:\n${JSON.stringify(stores)}\n\nPermintaan pengguna: ${text}`;
  try {
    const upstream = isGoogle
      ? await fetch(getGoogleGenerateUrl(baseUrl, model), {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts: [{ text: userPrompt }] }], generationConfig: { maxOutputTokens: 650, temperature: 0.3 } }),
        })
      : await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ model, messages: [{ role: "system", content: system }, { role: "user", content: userPrompt }], max_completion_tokens: 650 }),
        });
    if (!upstream.ok) {
      const providerRaw = await upstream.text().catch(() => "");
      const detail = getProviderDetail(providerRaw);
      return res.status(502).json({ error: "Layanan AI belum merespons dengan baik.", code: `${isGoogle ? "GEMINI" : "AI_PROVIDER"}_HTTP_${upstream.status}`, ...(isGoogle ? { configuredModel: model } : {}), ...(detail ? { detail } : {}) });
    }
    const data = await upstream.json();
    const raw = String(isGoogle ? data?.candidates?.[0]?.content?.parts?.map((part) => part?.text || "").join("\n") : data?.choices?.[0]?.message?.content || "").trim();
    const productMatch = raw.match(/\[PRODUCT_IDS:([^\]]*)\]/i);
    const storeMatch = raw.match(/\[STORE_IDS:([^\]]*)\]/i);
    const productIds = productMatch ? productMatch[1].split(",").map((id) => id.trim()).filter((id) => catalog.some((product) => product.id === id)) : [];
    const storeIds = storeMatch ? storeMatch[1].split(",").map((id) => id.trim()).filter((id) => stores.some((store) => store.id === id)) : [];
    const answer = raw.replace(/\s*\[(?:PRODUCT|STORE)_IDS:[^\]]*\]/ig, "").trim() || "Saya belum dapat menyusun jawaban. Coba jelaskan kebutuhan Anda dengan lebih spesifik.";
    return res.status(200).json({ answer, productIds, storeIds, products: catalog.filter((product) => productIds.includes(product.id)), stores: stores.filter((store) => storeIds.includes(store.id)), catalogCount: publicContext.products.length, storeCount: publicContext.stores.length });
  } catch {
    return res.status(502).json({ error: "Layanan AI belum dapat dihubungi." });
  }
}
