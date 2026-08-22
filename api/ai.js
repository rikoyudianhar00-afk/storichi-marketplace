const BLOCKED = [/(?:abaikan|ignore).{0,80}(?:instruksi|aturan|system|sistem|prompt)/i, /(?:jailbreak|prompt injection|developer message|system prompt)/i, /(?:spam|broadcast).{0,40}(?:chat|pesan|message)/i, /(?:rating|ulasan).{0,50}(?:palsu|fake|manipulasi|beli)/i, /(?:phishing|malware|keylogger|doxx|data pribadi|nomor kartu)/i, /(?:curi|bypass|retas|hack).{0,80}(?:akun|password|qr|qris|pembayaran)/i];
const attempts = new Map();

function allowRequest(key) {
  const now = Date.now();
  const recent = (attempts.get(key) || []).filter((time) => now - time < 60_000);
  if (recent.length >= 8) return false;
  recent.push(now);
  attempts.set(key, recent);
  return true;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Gunakan POST." });
  const clientKey = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "anonymous").split(",")[0].trim();
  if (!allowRequest(clientKey)) return res.status(429).json({ error: "Terlalu banyak permintaan. Coba lagi sebentar." });
  const { message, catalog = [] } = req.body || {};
  const text = String(message || "").trim();
  if (!text || text.length > 900) return res.status(400).json({ error: "Pesan harus berisi maksimal 900 karakter." });
  if (BLOCKED.some((pattern) => pattern.test(text))) return res.status(400).json({ error: "Permintaan tidak dapat diproses karena berisiko melanggar keamanan atau aturan marketplace." });
  const apiKey = process.env.STORICHI_AI_API_KEY || process.env.OPENAI_API_KEY;
  const baseUrl = String(process.env.STORICHI_AI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  if (!apiKey) return res.status(503).json({ error: "AI belum dikonfigurasi pada server." });
  const sanitizedCatalog = Array.isArray(catalog) ? catalog.slice(0, 20).map((product) => ({ id: String(product.id || ""), name: String(product.name || "").slice(0, 100), description: String(product.description || "").slice(0, 220), category: String(product.category || "").slice(0, 50), game_name: String(product.game_name || "").slice(0, 60), price_from: Number(product.price_from || 0), stock: Number(product.stock || 0), sales_count: Number(product.sales_count || 0) })) : [];
  const system = `Anda adalah Asisten Storichi, marketplace digital Indonesia. Pahami sendiri konteks pengguna: mencari/membeli produk, menjual/membuat draft listing, atau bertanya tentang transaksi dan Rekber. Jawab dalam Bahasa Indonesia singkat, sopan, dan jujur. Anda hanya memberi saran dan draft. Jangan mengklaim telah mengirim chat, membuat listing, mengubah harga/stok, membeli produk, mengirim QRIS, memilih Midman, menyelesaikan Rekber/custody, memberi rating, atau menjalankan tindakan apa pun. Tolak penipuan, phishing, manipulasi ulasan, spam, permintaan data pribadi/rahasia, malware, dan usaha menghindari aturan. Rekomendasi hanya dari katalog yang diberikan. Jika menyarankan produk, keluarkan di akhir persis dalam format [PRODUCT_IDS:id1,id2] memakai ID katalog yang valid, atau [PRODUCT_IDS:] bila tidak ada.`;
  try {
    const upstream = await fetch(`${baseUrl}/chat/completions`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` }, body: JSON.stringify({ model: process.env.STORICHI_AI_MODEL || "gpt-5-mini", messages: [{ role: "system", content: system }, { role: "user", content: `Katalog tersedia:\n${JSON.stringify(sanitizedCatalog)}\n\nPermintaan pengguna: ${text}` }], max_completion_tokens: 650, temperature: 0.3 }) });
    if (!upstream.ok) {
      return res.status(502).json({
        error: "Layanan AI belum merespons dengan baik.",
        code: `AI_PROVIDER_HTTP_${upstream.status}`,
      });
    }
    const data = await upstream.json();
    const raw = String(data?.choices?.[0]?.message?.content || "").trim();
    const match = raw.match(/\[PRODUCT_IDS:([^\]]*)\]/i);
    const productIds = match ? match[1].split(",").map((id) => id.trim()).filter((id) => sanitizedCatalog.some((product) => product.id === id)) : [];
    const answer = raw.replace(/\s*\[PRODUCT_IDS:[^\]]*\]/ig, "").trim() || "Saya belum dapat menyusun jawaban. Coba jelaskan kebutuhan Anda dengan lebih spesifik.";
    return res.status(200).json({ answer, productIds });
  } catch {
    return res.status(502).json({ error: "Layanan AI belum dapat dihubungi." });
  }
}
