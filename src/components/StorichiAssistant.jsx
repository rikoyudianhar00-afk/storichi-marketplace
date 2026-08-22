import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import { safetyReply } from "../lib/storichiAI";

const STARTERS = [
  "Cari top up game paling sesuai",
  "Tampilkan produk harga termurah",
  "Jelaskan alur Rekber yang aman",
  "Buat draft listing produk saya",
];

const IGNORED_SEARCH_WORDS = new Set(["aku", "anda", "apa", "atau", "bagi", "bisa", "buat", "cari", "dengan", "dan", "dari", "di", "ingin", "itu", "ke", "kami", "kamu", "mau", "paling", "produk", "saya", "sebuah", "serta", "toko", "untuk", "yang"]);

function normalized(value) {
  return String(value || "").toLocaleLowerCase("id").replace(/[^a-z0-9]+/g, " ").trim();
}

function searchTokens(value) {
  return [...new Set(normalized(value).split(" ").filter((token) => token.length > 1 && !IGNORED_SEARCH_WORDS.has(token)))];
}

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
    view_count: product.view_count,
    seller_id: product.seller_id,
  };
}

function storePayload(store) {
  return {
    id: store.id,
    display_name: store.display_name,
    bio: store.bio,
    is_verified: Boolean(store.is_verified),
    is_midman: Boolean(store.is_midman),
    is_owner: Boolean(store.is_owner),
    product_count: Number(store.product_count || 0),
  };
}

function rankProductsForAI(products, query) {
  const queryText = normalized(query);
  const tokens = searchTokens(query);
  return products.map((product) => {
    const searchable = normalized([product.name, product.description, product.category, product.game_name].join(" "));
    const tokenScore = tokens.reduce((score, token) => score + (searchable.includes(token) ? 18 : 0), 0);
    const exactScore = queryText && searchable.includes(queryText) ? 50 : 0;
    const popularity = Math.min(14, Math.log1p(Number(product.sales_count || 0)) * 3 + Math.log1p(Number(product.like_count || 0)));
    return { product, score: exactScore + tokenScore + popularity };
  }).sort((left, right) => right.score - left.score || Number(right.product.sales_count || 0) - Number(left.product.sales_count || 0)).slice(0, 80).map(({ product }) => product);
}

function rankStoresForAI(stores, query, products) {
  const queryText = normalized(query);
  const tokens = searchTokens(query);
  const matchedSellerIds = new Set(products.map((product) => product.seller_id).filter(Boolean));
  return stores.map((store) => {
    const searchable = normalized([store.display_name, store.bio, store.is_owner ? "owner" : "", store.is_verified ? "verified" : "", store.is_midman ? "midman" : ""].join(" "));
    const tokenScore = tokens.reduce((score, token) => score + (searchable.includes(token) ? 20 : 0), 0);
    const exactScore = queryText && searchable.includes(queryText) ? 45 : 0;
    const productMatchScore = matchedSellerIds.has(store.id) ? 20 : 0;
    const roleScore = store.is_owner ? 4 : store.is_verified ? 3 : store.is_midman ? 2 : 0;
    return { store, score: exactScore + tokenScore + productMatchScore + roleScore + Math.min(8, Number(store.product_count || 0)) };
  }).sort((left, right) => right.score - left.score || String(left.store.display_name || "").localeCompare(String(right.store.display_name || ""), "id")).slice(0, 40).map(({ store }) => store);
}

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
  const [catalog, setCatalog] = useState([]);
  const [stores, setStores] = useState([]);
  const [publicDataLoading, setPublicDataLoading] = useState(false);
  const [publicDataLoaded, setPublicDataLoaded] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState([{ id: "welcome", role: "assistant", text: "Halo, saya Asisten Storichi. Saya dapat membantu mencari produk, menjelaskan Rekber, atau membuat draft listing. Saya tidak akan membeli, mengirim pesan, mengubah data, atau menilai transaksi tanpa persetujuan Anda." }]);

  useEffect(() => {
    if (!open || publicDataLoaded) return undefined;
    let active = true;
    async function loadAllPublicRows(table, columns, configure) {
      const pageSize = 500;
      const rows = [];
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await configure(supabase.from(table).select(columns)).range(from, from + pageSize - 1);
        if (error) throw error;
        rows.push(...(data || []));
        if (!data || data.length < pageSize) return rows;
      }
    }
    async function loadPublicContext() {
      setPublicDataLoading(true);
      try {
        const [allProducts, allStores] = await Promise.all([
          loadAllPublicRows("products", "id, slug, name, description, category, game_name, price_from, stock, sales_count, like_count, view_count, seller_id", (query) => query.eq("is_active", true).gt("stock", 0).order("sales_count", { ascending: false })),
          loadAllPublicRows("profiles", "id, display_name, bio, is_verified, is_midman, is_owner, is_seller", (query) => query.order("display_name", { ascending: true })),
        ]);
        const productCounts = allProducts.reduce((counts, product) => counts.set(product.seller_id, (counts.get(product.seller_id) || 0) + 1), new Map());
        if (active) {
          setCatalog(allProducts);
          setStores(allStores.map((store) => ({ ...store, product_count: productCounts.get(store.id) || 0 })).filter((store) => store.product_count > 0));
        }
      } catch {
        if (active) { setCatalog([]); setStores([]); }
      } finally {
        if (active) { setPublicDataLoading(false); setPublicDataLoaded(true); }
      }
    }
    void loadPublicContext();
    return () => { active = false; };
  }, [open, publicDataLoaded]);

  async function send(raw) {
    const message = String(raw || input).trim();
    if (!message || busy) return;
    const localSafety = safetyReply(message);
    setMessages((current) => [...current, { id: `u-${Date.now()}`, role: "user", text: message }]);
    setInput("");
    if (localSafety) {
      setMessages((current) => [...current, { id: `a-${Date.now()}`, role: "assistant", text: localSafety, products: [] }]);
      return;
    }
    setBusy(true);
    let answer;
    try {
      const response = await fetch("/api/ai", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          message,
          catalog: rankProductsForAI(catalog, message).map(productPayload),
          stores: rankStoresForAI(stores, message, rankProductsForAI(catalog, message)).map(storePayload),
        }),
      });
      if (response.ok) {
        const data = await response.json();
        answer = {
          answer: data.answer,
          products: data.productIds ? catalog.filter((product) => data.productIds.includes(product.id)) : [],
          stores: data.storeIds ? stores.filter((store) => data.storeIds.includes(store.id)) : [],
        };
      } else {
        const failure = await response.json().catch(() => ({}));
        const providerProblem = failure?.code?.startsWith("AI_PROVIDER_") || failure?.code?.startsWith("GEMINI_");
        if (providerProblem || failure?.error) {
          answer = {
            answer: `${failure.error || "Layanan Gemini belum siap digunakan."}${failure.guidance ? ` ${failure.guidance}` : ""} Saya tidak akan menggantinya dengan jawaban template—silakan coba lagi beberapa saat lagi.`,
            products: [],
            stores: [],
          };
        } else throw new Error("AI server tidak tersedia");
      }
    } catch {
      answer = {
        answer: "AI online sedang tidak dapat dijangkau. Saya tidak akan menggantinya dengan jawaban template; silakan periksa koneksi Anda lalu coba lagi.",
        products: [],
        stores: [],
      };
    } finally {
      setBusy(false);
    }
    setMessages((current) => [...current, { id: `a-${Date.now()}`, role: "assistant", text: answer.answer, products: answer.products || [], stores: answer.stores || [] }]);
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
        <div className="storichi-ai-messages" aria-live="polite">{messages.map((entry) => <article className={`storichi-ai-message ${entry.role}`} key={entry.id}><p>{entry.text}</p>{entry.products?.length > 0 && <div className="storichi-ai-products">{entry.products.map((product) => <button type="button" key={product.id} onClick={() => { setOpen(false); navigate(`/produk/${product.slug || product.id}`); }}><b>{product.name}</b><span>{Number(product.price_from || 0).toLocaleString("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 })}</span></button>)}</div>}{entry.stores?.length > 0 && <div className="storichi-ai-stores">{entry.stores.map((store) => <button type="button" key={store.id} onClick={() => { setOpen(false); navigate(`/toko/${store.id}`); }}><b>{store.display_name || "Toko Storichi"}</b><span>{storeRole(store)} · {store.product_count || 0} produk aktif</span></button>)}</div>}</article>)}{busy && <article className="storichi-ai-message assistant"><p>Menyiapkan saran…</p></article>}{publicDataLoading && <article className="storichi-ai-message assistant"><p>Menyiapkan katalog dan toko publik…</p></article>}</div>
        <div className="storichi-ai-starters">{STARTERS.map((starter) => <button type="button" key={starter} onClick={() => send(starter)} disabled={publicDataLoading}>{starter}</button>)}</div>
        <form className="storichi-ai-composer" onSubmit={(event) => { event.preventDefault(); send(); }}><textarea value={input} onChange={(event) => setInput(event.target.value)} maxLength={900} rows={2} disabled={publicDataLoading} placeholder="Ceritakan produk, toko, transaksi, atau listing yang Anda butuhkan…" /><button type="submit" disabled={busy || publicDataLoading || !input.trim()}>Kirim</button></form>
        <p className="storichi-ai-note">AI mencari dari katalog dan toko publik. Data privat, chat, QRIS, email, serta tindakan pembelian atau perubahan data tidak digunakan tanpa persetujuan Anda.</p>
      </section>
    </div>}
  </>;
}
