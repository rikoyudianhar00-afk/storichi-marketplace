import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { safetyReply } from "../lib/storichiAI";

const STARTERS = [
  "Cari top up game paling sesuai",
  "Tampilkan produk harga termurah",
  "Jelaskan alur Rekber yang aman",
  "Buat draft listing produk saya",
];

function storeRole(store) {
  if (store.is_owner) return "Owner";
  if (store.is_verified) return "Verified Seller";
  if (store.is_midman) return "Midman (MM)";
  return "Seller";
}

export default function StorichiAssistant() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState([{ id: "welcome", role: "assistant", text: "Halo, saya Asisten Storichi. Saya dapat membantu mencari produk dan toko publik, menjelaskan Rekber, atau membuat draft listing. Saya tidak akan membeli, mengirim pesan, mengubah data, atau menilai transaksi tanpa persetujuan Anda." }]);

  async function send(raw) {
    const message = String(raw || input).trim();
    if (!message || busy) return;
    const localSafety = safetyReply(message);
    setMessages((current) => [...current, { id: `u-${Date.now()}`, role: "user", text: message }]);
    setInput("");
    if (localSafety) {
      setMessages((current) => [...current, { id: `a-${Date.now()}`, role: "assistant", text: localSafety, products: [], stores: [] }]);
      return;
    }
    setBusy(true);
    let answer;
    try {
      const response = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify({
          message,
          publicSupabase: {
            url: import.meta.env.VITE_SUPABASE_URL,
            anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
        }),
      });
      if (response.ok) {
        const data = await response.json();
        answer = { answer: data.answer, products: data.products || [], stores: data.stores || [] };
      } else {
        const failure = await response.json().catch(() => ({}));
        if (failure?.code?.startsWith("AI_PROVIDER_") || failure?.code?.startsWith("GEMINI_") || failure?.code === "PUBLIC_CATALOG_UNAVAILABLE" || failure?.error) {
          answer = { answer: `${failure.error || "Layanan Gemini belum siap digunakan."}${failure.guidance ? ` ${failure.guidance}` : ""} Saya tidak akan menggantinya dengan jawaban template—silakan coba lagi beberapa saat lagi.`, products: [], stores: [] };
        } else throw new Error("AI server tidak tersedia");
      }
    } catch {
      answer = { answer: "AI online sedang tidak dapat dijangkau. Saya tidak akan menggantinya dengan jawaban template; silakan periksa koneksi Anda lalu coba lagi.", products: [], stores: [] };
    } finally {
      setBusy(false);
    }
    setMessages((current) => [...current, { id: `a-${Date.now()}`, role: "assistant", text: answer.answer, products: answer.products, stores: answer.stores }]);
  }

  return <>
    <button type="button" className="storichi-ai-bubble" aria-label="Buka Asisten Storichi" onClick={() => setOpen(true)}>
      <img src="/storichi-logo.jpg" alt="" />
      <span>AI</span>
    </button>
    {open && <div className="storichi-ai-layer" role="dialog" aria-modal="true" aria-label="Asisten Storichi">
      <button type="button" className="storichi-ai-backdrop" aria-label="Tutup asisten" onClick={() => setOpen(false)} />
      <section className="storichi-ai-panel">
        <header className="storichi-ai-head"><div className="storichi-ai-brand"><img src="/storichi-logo.jpg" alt="" /><div><strong>Asisten Storichi</strong><small>Rekomendasi dengan persetujuan Anda</small></div></div><button type="button" className="storichi-ai-close" onClick={() => setOpen(false)} aria-label="Tutup">×</button></header>
        <div className="storichi-ai-messages" aria-live="polite">{messages.map((entry) => <article className={`storichi-ai-message ${entry.role}`} key={entry.id}><p>{entry.text}</p>{entry.products?.length > 0 && <div className="storichi-ai-products">{entry.products.map((product) => <button type="button" key={product.id} onClick={() => { setOpen(false); navigate(`/produk/${product.slug || product.id}`); }}><b>{product.name}</b><span>{Number(product.price_from || 0).toLocaleString("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 })}</span></button>)}</div>}{entry.stores?.length > 0 && <div className="storichi-ai-stores">{entry.stores.map((store) => <button type="button" key={store.id} onClick={() => { setOpen(false); navigate(`/toko/${store.id}`); }}><b>{store.display_name || "Toko Storichi"}</b><span>{storeRole(store)} · {store.product_count || 0} produk aktif</span></button>)}</div>}</article>)}{busy && <article className="storichi-ai-message assistant"><p>Mencari dari katalog dan toko publik Storichi…</p></article>}</div>
        <div className="storichi-ai-starters">{STARTERS.map((starter) => <button type="button" key={starter} onClick={() => send(starter)} disabled={busy}>{starter}</button>)}</div>
        <form className="storichi-ai-composer" onSubmit={(event) => { event.preventDefault(); send(); }}><textarea value={input} onChange={(event) => setInput(event.target.value)} maxLength={900} rows={2} placeholder="Ceritakan produk, toko, transaksi, atau listing yang Anda butuhkan…" /><button type="submit" disabled={busy || !input.trim()}>Kirim</button></form>
        <p className="storichi-ai-note">AI membaca katalog dan toko yang bersifat publik langsung dari database. Data privat, chat, QRIS, email, serta tindakan pembelian atau perubahan data tidak digunakan tanpa persetujuan Anda.</p>
      </section>
    </div>}
  </>;
}
