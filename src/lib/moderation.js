const BLOCKED_TERMS = [
  "anjing", "bangsat", "bajingan", "brengsek", "goblok", "tolol", "bodoh", "kampret", "keparat",
  "kontol", "memek", "ngentot", "jancuk", "lonte", "perek", "pelacur", "asu",
  "fuck", "fucker", "bitch", "dick", "pussy", "cunt", "whore", "slut",
];

const THREAT_PATTERNS = [
  /bunuh\s+(kamu|lu|elo|dia)/i,
  /mati\s+saja/i,
  /i(?:'|’)?ll\s+kill/i,
  /kill\s+you/i,
];

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function moderateMessage(value) {
  const original = String(value || "").trim();
  if (!original) return { allowed: false, message: "Pesan tidak boleh kosong." };
  if (original.length > 2000) return { allowed: false, message: "Pesan terlalu panjang. Maksimal 2.000 karakter." };

  const normalized = normalizeText(original);
  const blockedTerm = BLOCKED_TERMS.find((term) => new RegExp(`(^|\\s)${term.replace(" ", "\\s+")}($|\\s)`, "i").test(normalized));
  if (blockedTerm) return { allowed: false, message: "Pesan tidak dapat dikirim karena mengandung kata yang tidak pantas." };
  if (THREAT_PATTERNS.some((pattern) => pattern.test(original))) return { allowed: false, message: "Pesan bernada ancaman tidak diperbolehkan." };
  if (/(https?:\/\/|www\.)/i.test(original) && /(apk|phishing|wallet|seed|password|otp)/i.test(original)) {
    return { allowed: false, message: "Tautan atau permintaan data sensitif tidak diperbolehkan di chat." };
  }
  return { allowed: true, value: original };
}
