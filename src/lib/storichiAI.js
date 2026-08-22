const RISKY_PATTERNS = [
  /(?:abaikan|ignore).{0,80}(?:instruksi|aturan|system|sistem|prompt)/i,
  /(?:jailbreak|prompt injection|developer message|system prompt)/i,
  /(?:spam|broadcast).{0,40}(?:chat|pesan|message)/i,
  /(?:rating|ulasan).{0,50}(?:palsu|fake|manipulasi|beli)/i,
  /(?:phishing|malware|keylogger|doxx|data pribadi|nomor kartu)/i,
  /(?:curi|bypass|retas|hack).{0,80}(?:akun|password|qr|qris|pembayaran)/i,
];

export function safetyReply(message = "") {
  const text = String(message).trim();
  if (!text) return null;
  if (RISKY_PATTERNS.some((pattern) => pattern.test(text))) {
    return "Saya tidak dapat membantu permintaan yang berisiko menipu, memanipulasi, mengambil data, atau menghindari aturan Storichi. Saya tetap dapat membantu mencari produk, membuat draft listing yang jujur, atau menjelaskan alur Rekber yang aman.";
  }
  return null;
}

function tokens(value = "") {
  return String(value).toLocaleLowerCase("id").split(/[^\p{L}\p{N}]+/u).filter((token) => token.length > 1);
}

function formatRupiah(value) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount) : "Harga belum tersedia";
}

export function rankCatalog(products = [], query = "") {
  const requested = tokens(query);
  return [...products]
    .filter((product) => product?.is_active !== false && Number(product?.stock ?? 1) > 0)
    .map((product) => {
      const searchable = tokens([product.name, product.description, product.category, product.game_name].filter(Boolean).join(" "));
      const overlap = requested.reduce((score, term) => score + (searchable.includes(term) ? 15 : 0), 0);
      const partial = requested.reduce((score, term) => score + (searchable.some((candidate) => candidate.includes(term)) ? 5 : 0), 0);
      const popularity = Math.min(12, Math.log1p(Number(product.sales_count || 0)) * 2 + Math.log1p(Number(product.like_count || 0)));
      return { product, score: overlap + partial + popularity };
    })
    .sort((a, b) => b.score - a.score || Number(b.product.sales_count || 0) - Number(a.product.sales_count || 0))
    .map(({ product }) => product)
    .slice(0, 4);
}

function sellerDraft(text) {
  const cleaned = String(text).replace(/(?:buatkan|tolong|draft|listing|deskripsi|produk)/gi, "").trim() || "produk digital";
  return `Draft awal untuk **${cleaned}**:\n\n• Judul: ${cleaned.slice(0, 72)}\n• Deskripsi: Jelaskan isi produk, proses pengiriman, syarat, dan batasannya secara jujur.\n• Kategori: pilih kategori paling spesifik yang tersedia.\n• Harga: bandingkan dengan produk serupa dan cantumkan jumlah/varian dengan jelas.\n\nSaya hanya membuat draft. Periksa fakta, harga, dan stok sebelum Anda menyimpan atau mempublikasikannya.`;
}

export function createLocalAnswer({ message, mode = "buyer", products = [] }) {
  const blocked = safetyReply(message);
  if (blocked) return { answer: blocked, products: [] };
  const lower = String(message || "").toLocaleLowerCase("id");
  if (/(?:^(?:hai|halo|hi)$|selamat (?:pagi|siang|sore|malam))/i.test(lower)) {
    return { answer: "Halo. Ceritakan kebutuhan Anda: saya dapat membantu mencari produk, menjelaskan transaksi dan Rekber, atau membuat draft listing untuk dijual.", products: [] };
  }
  if (/(?:judul|deskripsi|listing|jual|produk saya|stok)/i.test(lower)) {
    return { answer: sellerDraft(message), products: [] };
  }
  if (/(?:rekber|midman|mm|qris|custody)/i.test(lower)) {
    return { answer: "Untuk transaksi bernilai tinggi, gunakan Rekber dengan Midman (MM). QRIS MM harus tersimpan di Akun MM. Buyer dan Seller tetap perlu meninjau detail transaksi, chat, serta persetujuan sebelum custody diselesaikan.", products: [] };
  }
  const recommended = rankCatalog(products, message);
  if (recommended.length) {
    const labels = recommended.slice(0, 3).map((product) => `**${product.name}** (${formatRupiah(product.price_from)})`).join(", ");
    return { answer: `Saya menemukan pilihan yang paling relevan: ${labels}. Buka kartu produk untuk memeriksa Seller, detail, rating, dan stok sebelum mengajukan pembelian.`, products: recommended };
  }
  return { answer: products.length ? "Saya belum menemukan produk yang cocok dari katalog saat ini. Coba tulis game/kategori, kisaran harga, atau nama item yang lebih spesifik." : "Saya sedang memuat katalog Storichi. Sambil menunggu, tulis game atau kategori, kisaran harga, dan jumlah yang Anda perlukan.", products: [] };
}
