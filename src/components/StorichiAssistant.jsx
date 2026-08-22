import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import { createLocalAnswer, safetyReply } from "../lib/storichiAI";

const STARTERS = [
  "Cari top up game paling sesuai",
  "Tampilkan produk harga termurah",
  "Jelaskan alur Rekber yang aman",
  "Buat draft listing produk saya",
];

function productPayload(product) {
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    description: product.description,
    category: product.category,
    game_name: product.game_name,
    price_from: product.price_from,
    stock: product.stock,
    sales_count: product.sales_count,
    like_count: product.like_count,
  };
}

export default function StorichiAssistant() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const recognitionRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [catalog, setCatalog] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const [messages, setMessages] = useState([{ id: "welcome", role: "assistant", text: "Halo, saya Asisten Storichi. Saya dapat membantu mencari produk, menjelaskan Rekber, atau membuat draft listing. Saya tidak akan membeli, mengirim pesan, mengubah data, atau menilai transaksi tanpa persetujuan Anda." }]);

  useEffect(() => {
    if (!open || catalog.length) return;
    supabase.from("products").select("id, slug, name, description, category, game_name, price_from, stock, sales_count, like_count, is_active").eq("is_active", true).gt("stock", 0).order("sales_count", { ascending: false }).limit(60).then(({ data }) => setCatalog(data || []));
  }, [open, catalog.length]);

  useEffect(() => () => {
    recognitionRef.current?.abort?.();
    if (typeof window !== "undefined") window.speechSynthesis?.cancel?.();
  }, []);

  function speak(text) {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      setVoiceStatus("Browser ini tidak menyediakan jawaban suara. Jawaban tetap tampil sebagai teks.");
      return;
    }
    const cleaned = String(text).replace(/\*\*/g, "").replace(/[•]/g, "").replace(/\n+/g, ". ").trim();
    if (!cleaned) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(cleaned);
    utterance.lang = "id-ID";
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.onstart = () => { setSpeaking(true); setVoiceStatus("AI sedang menjawab dengan suara…"); };
    utterance.onend = () => { setSpeaking(false); setVoiceStatus(""); };
    utterance.onerror = () => { setSpeaking(false); setVoiceStatus("Jawaban teks tersedia, tetapi suara belum dapat diputar."); };
    window.speechSynthesis.speak(utterance);
  }

  function stopSpeaking() {
    if (typeof window !== "undefined") window.speechSynthesis?.cancel?.();
    setSpeaking(false);
    setVoiceStatus("");
  }

  function startListening() {
    if (typeof window === "undefined") return;
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      setVoiceStatus("Speech-to-text belum didukung browser ini. Gunakan Chrome Android terbaru atau ketik pesan Anda.");
      return;
    }
    if (busy) return;
    stopSpeaking();
    const recognition = new Recognition();
    recognition.lang = "id-ID";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => setVoiceStatus("Mendengarkan… silakan bicara.");
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results).map((result) => result[0]?.transcript || "").join(" ").trim();
      setInput(transcript);
      if (event.results[event.results.length - 1]?.isFinal && transcript) {
        setVoiceStatus("Suara ditranskrip. Mengirim ke AI…");
        void send(transcript);
      }
    };
    recognition.onerror = (event) => {
      const detail = event.error === "not-allowed" ? "Izin mikrofon ditolak. Izinkan mikrofon pada browser lalu coba lagi." : event.error === "no-speech" ? "Suara tidak terdeteksi. Coba bicara lagi." : "Transkripsi suara belum berhasil. Silakan coba lagi atau ketik pesan.";
      setVoiceStatus(detail);
    };
    recognition.onend = () => { recognitionRef.current = null; };
    recognitionRef.current = recognition;
    recognition.start();
  }

  async function send(raw) {
    const message = String(raw || input).trim();
    if (!message || busy) return;
    const localSafety = safetyReply(message);
    setMessages((current) => [...current, { id: `u-${Date.now()}`, role: "user", text: message }]);
    setInput("");
    if (localSafety) {
      setMessages((current) => [...current, { id: `a-${Date.now()}`, role: "assistant", text: localSafety, products: [] }]);
      speak(localSafety);
      return;
    }
    setBusy(true);
    setVoiceStatus("AI sedang menyusun jawaban…");
    let answer;
    try {
      const response = await fetch("/api/ai", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ message, catalog: catalog.slice(0, 20).map(productPayload) }),
      });
      if (response.ok) {
        const data = await response.json();
        answer = { answer: data.answer, products: data.productIds ? catalog.filter((product) => data.productIds.includes(product.id)) : [] };
      } else throw new Error("AI server tidak tersedia");
    } catch {
      answer = createLocalAnswer({ message, products: catalog });
    } finally {
      setBusy(false);
    }
    setMessages((current) => [...current, { id: `a-${Date.now()}`, role: "assistant", text: answer.answer, products: answer.products || [] }]);
    speak(answer.answer);
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
        <div className="storichi-ai-messages" aria-live="polite">{messages.map((entry) => <article className={`storichi-ai-message ${entry.role}`} key={entry.id}><p>{entry.text}</p>{entry.products?.length > 0 && <div className="storichi-ai-products">{entry.products.map((product) => <button type="button" key={product.id} onClick={() => { setOpen(false); navigate(`/produk/${product.slug || product.id}`); }}><b>{product.name}</b><span>{Number(product.price_from || 0).toLocaleString("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 })}</span></button>)}</div>}</article>)}{busy && <article className="storichi-ai-message assistant"><p>Menyiapkan saran…</p></article>}</div>
        <div className="storichi-ai-starters">{STARTERS.map((starter) => <button type="button" key={starter} onClick={() => send(starter)}>{starter}</button>)}</div>
        <form className="storichi-ai-composer" onSubmit={(event) => { event.preventDefault(); send(); }}><textarea value={input} onChange={(event) => setInput(event.target.value)} maxLength={900} rows={2} placeholder="Ceritakan produk, transaksi, atau listing yang Anda butuhkan…" /><button type="button" className="storichi-ai-mic" onClick={startListening} disabled={busy} aria-label="Bicara ke AI">⌁</button><button type="submit" disabled={busy || !input.trim()}>Kirim</button></form>
        {voiceStatus && <div className="storichi-ai-voice-status" role="status"><span>{voiceStatus}</span>{speaking && <button type="button" onClick={stopSpeaking}>Hentikan suara</button>}</div>}
        <p className="storichi-ai-note">AI hanya memberi saran. Pembelian, chat, QRIS, Rekber, rating, dan perubahan listing selalu memerlukan tindakan atau persetujuan Anda.</p>
      </section>
    </div>}
  </>;
}
