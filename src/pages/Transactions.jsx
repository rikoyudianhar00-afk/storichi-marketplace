import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import RoleBadge from "../components/RoleBadge";

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
}

function stars(value) {
  return Array.from({ length: 5 }, (_, index) => <span key={index} className={index < Number(value || 0) ? "is-filled" : ""}>★</span>);
}

export default function Transactions() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [messagesByThread, setMessagesByThread] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    let active = true;
    async function load() {
      const { data: requests } = await supabase
        .from("purchase_requests")
        .select("*, product:products(id, slug, name, image_url, category), buyer:profiles!purchase_requests_buyer_id_fkey(display_name), seller:profiles!purchase_requests_seller_id_fkey(id, display_name, is_seller, is_verified, is_midman, is_owner), rekber_group:rekber_groups(id, code, third_party_id, third_party_kind, buyer_id, seller_id)")
        .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`)
        .eq("status", "completed")
        .order("completed_at", { ascending: false });
      const rawRows = requests || [];
      const threadIds = rawRows.map((item) => item.thread_id).filter(Boolean);
      const thirdPartyIds = rawRows.map((item) => item.rekber_group?.third_party_id).filter(Boolean);
      const [{ data: messages }, { data: thirdPartyProfiles }] = await Promise.all([
        threadIds.length ? supabase.from("chat_messages").select("*").in("thread_id", threadIds).order("created_at", { ascending: true }) : Promise.resolve({ data: [] }),
        thirdPartyIds.length ? supabase.from("profiles").select("id, display_name, avatar_url, is_verified, is_midman, is_owner").in("id", [...new Set(thirdPartyIds)]) : Promise.resolve({ data: [] }),
      ]);
      const thirdPartyById = new Map((thirdPartyProfiles || []).map((profile) => [profile.id, profile]));
      const rows = rawRows.map((item) => ({ ...item, thirdParty: thirdPartyById.get(item.rekber_group?.third_party_id) || null }));
      const grouped = (messages || []).reduce((acc, message) => {
        acc[message.thread_id] = [...(acc[message.thread_id] || []), message];
        return acc;
      }, {});
      if (active) {
        setItems(rows);
        setMessagesByThread(grouped);
        setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [user]);

  if (!user) return <main className="container empty-state"><h2>Masuk untuk melihat transaksi</h2><p>Riwayat pembelian dan penjualanmu akan tersimpan di sini.</p></main>;
  if (loading) return <main className="container"><div className="skeleton" style={{ height: 280, marginTop: 24 }} /></main>;

  return (
    <main className="container transactions-page">
      <div className="transactions-heading"><span className="section-kicker">Riwayat transaksi</span><h1 className="page-title">Transaksi</h1><p className="page-subtitle">Riwayat lengkap dari permintaan beli sampai DONE seller.</p></div>
      {!items.length ? <div className="empty-state"><p>Belum ada transaksi yang selesai.</p></div> : (
        <div className="transaction-list">
          {items.map((item) => {
            const isBuyer = item.buyer_id === user.id;
            const messages = messagesByThread[item.thread_id] || [];
            const itemQuantity = Math.max(1, Number(item.item_quantity || 1));
            const unitPrice = Number(item.final_price || 0) / itemQuantity;
            return (
              <article className="transaction-card" key={item.id}>
                <Link to={`/produk/${item.product?.slug || ""}`} className="transaction-product">
                  {item.product?.image_url ? <img src={item.product.image_url} alt="" /> : <span className="transaction-product-fallback">P</span>}
                  <span><strong>{item.product?.name || "Produk"}</strong><small>{item.product?.category || "Produk digital"} · Buka detail produk</small></span>
                </Link>
                <div className="transaction-summary"><span className="status-pill status-completed">Selesai</span><strong>{isBuyer ? "Kamu membeli" : "Terjual ke Buyer"}</strong></div>
                <details className="transaction-chat-history"><summary>Riwayat chat ({messages.length} pesan)</summary><div className="transaction-chat-lines">{messages.length ? messages.map((message) => <div key={message.id} className={message.sender_id === user.id ? "is-mine" : "is-theirs"}><span>{message.visibility === "seller_whisper" ? "Whisper Seller · " : message.visibility === "buyer_whisper" ? "Whisper Buyer · " : ""}{message.content || (message.attachment_type === "image" ? "Gambar" : "Video")}</span><time>{formatDate(message.created_at)}</time></div>) : <p>Tidak ada teks chat.</p>}</div></details>
                <div className="transaction-bottom-grid"><div><small>Harga : jumlah</small><strong>Rp{Number(item.final_price || 0).toLocaleString("id-ID")} : {itemQuantity}</strong><span className="transaction-unit-price">Rp{unitPrice.toLocaleString("id-ID", { maximumFractionDigits: 2 })} / barang</span></div><div><small>{isBuyer ? "Tanggal dibeli" : "Tanggal terjual"}</small><strong>{formatDate(item.completed_at || item.seller_done_at)}</strong></div><div><small>Rating produk</small><span className="transaction-stars">{stars(item.buyer_rating)} <b>{item.buyer_rating || 0}/5</b></span><Link to={`/toko/${item.seller?.id || item.seller_id}`} className="transaction-seller-meta transaction-seller-link" aria-label={`Buka toko ${item.seller?.display_name || "Seller"}`}><strong>{item.seller?.display_name || "Seller"}</strong><RoleBadge profile={item.seller} size={14} /></Link></div>{item.thirdParty && <div className="transaction-third-party-meta"><small>Midman (MM) Rekber</small><strong>{item.thirdParty.display_name}</strong><span>{item.rekber_group?.third_party_kind === "midman" ? "⚖️ Midman (MM)" : item.rekber_group?.third_party_kind === "verified" ? "Verified MM" : "Midman (MM)"}</span></div>}</div>
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}
