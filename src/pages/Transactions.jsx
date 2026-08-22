import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
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

function messageText(message) {
  if (message.content?.trim()) return message.content;
  if (message.attachment_type === "image") return "Foto dikirim";
  if (message.attachment_type === "qris") return "QRIS pembayaran dikirim";
  if (message.attachment_type === "video") return "Video dikirim";
  return "Lampiran dikirim";
}

function visibilityLabel(visibility) {
  if (visibility === "seller_whisper") return "Whisper Seller";
  if (visibility === "buyer_whisper") return "Whisper Buyer";
  return "Chat utama";
}

function reviewSummary(reviews) {
  const values = (reviews || []).map((review) => Number(review.rating)).filter((rating) => rating >= 1 && rating <= 5);
  const total = values.reduce((sum, rating) => sum + rating, 0);
  return { count: values.length, average: values.length ? total / values.length : 0 };
}

export default function Transactions() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [messagesByThread, setMessagesByThread] = useState({});
  const [rekberMessagesByGroup, setRekberMessagesByGroup] = useState({});
  const [messageProfiles, setMessageProfiles] = useState({});
  const [thirdPartyProfiles, setThirdPartyProfiles] = useState({});
  const [mmReviewsByGroup, setMmReviewsByGroup] = useState({});
  const [productReviewsByRequest, setProductReviewsByRequest] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return undefined;
    }

    let active = true;
    let reloadTimer;

    async function loadTransactions(isInitial = false) {
      if (isInitial) setLoading(true);

      const requestSelect = "id, thread_id, buyer_id, seller_id, product_id, rekber_group_id, status, purchase_mode, final_price, item_quantity, buyer_rating, completed_at, seller_done_at, created_at, product:products(id, slug, name, image_url, category), buyer:profiles!purchase_requests_buyer_id_fkey(id, display_name, avatar_url, is_seller, is_verified, is_midman, is_owner), seller:profiles!purchase_requests_seller_id_fkey(id, display_name, avatar_url, is_seller, is_verified, is_midman, is_owner)";
      const participantFilter = `buyer_id.eq.${user.id},seller_id.eq.${user.id},third_party_id.eq.${user.id}`;
      const [{ data: ownRequests, error: requestsError }, { data: completedGroups, error: groupsError }] = await Promise.all([
        supabase.from("purchase_requests").select(requestSelect).or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`).eq("status", "completed").order("completed_at", { ascending: false }).limit(100),
        supabase.from("rekber_groups").select("id, purchase_request_id, code, name, buyer_id, seller_id, midman_id, third_party_id, third_party_kind, status, workflow_status, completed_at, custody_completed_at, released_at, activated_at, custody_requested_at, midman_rating_requested_at").or(participantFilter).eq("status", "completed").order("completed_at", { ascending: false }).limit(100),
      ]);

      if (requestsError) console.warn("Riwayat purchase request gagal dimuat:", requestsError.message);
      if (groupsError) console.warn("Riwayat Rekber gagal dimuat:", groupsError.message);

      const safeGroups = completedGroups || [];
      const groupRequestIds = [...new Set(safeGroups.map((group) => group.purchase_request_id).filter(Boolean))];
      const { data: rekberRequests, error: rekberRequestsError } = groupRequestIds.length
        ? await supabase.from("purchase_requests").select(requestSelect).in("id", groupRequestIds).limit(100)
        : { data: [], error: null };
      if (rekberRequestsError) console.warn("Purchase request Rekber gagal dimuat:", rekberRequestsError.message);

      const groupByRequestId = new Map(safeGroups.filter((group) => group.purchase_request_id).map((group) => [group.purchase_request_id, group]));
      const rawRows = [...new Map([...(ownRequests || []), ...(rekberRequests || [])].map((item) => [item.id, item])).values()]
        .map((item) => ({ ...item, rekber_group: groupByRequestId.get(item.id) || null }))
        .sort((a, b) => new Date(b.completed_at || b.rekber_group?.custody_completed_at || b.rekber_group?.released_at || b.seller_done_at || b.created_at || 0) - new Date(a.completed_at || a.rekber_group?.custody_completed_at || a.rekber_group?.released_at || a.seller_done_at || a.created_at || 0));

      const threadIds = [...new Set(rawRows.map((item) => item.thread_id).filter(Boolean))];
      const groupIds = [...new Set(rawRows.map((item) => item.rekber_group?.id).filter(Boolean))];
      const thirdPartyIds = [...new Set(rawRows.map((item) => item.rekber_group?.third_party_id).filter(Boolean))];
      const [{ data: messages, error: messagesError }, { data: legacyRekberMessages }, { data: thirdPartyProfiles }, { data: mmReviews }, { data: productReviews }] = await Promise.all([
        threadIds.length ? supabase.from("chat_messages").select("id, thread_id, sender_id, content, attachment_url, attachment_type, visibility, created_at").in("thread_id", threadIds).order("created_at", { ascending: true }).limit(1000) : Promise.resolve({ data: [], error: null }),
        groupIds.length ? supabase.from("rekber_messages").select("id, group_id, sender_id, content, attachment_url, attachment_type, created_at").in("group_id", groupIds).order("created_at", { ascending: true }).limit(1000) : Promise.resolve({ data: [] }),
        thirdPartyIds.length ? supabase.from("profiles").select("id, display_name, avatar_url, is_seller, is_verified, is_midman, is_owner").in("id", thirdPartyIds).limit(100) : Promise.resolve({ data: [] }),
        groupIds.length ? supabase.from("rekber_third_party_reviews").select("id, group_id, purchase_request_id, third_party_id, reviewer_id, rating, created_at").in("group_id", groupIds).limit(500) : Promise.resolve({ data: [] }),
        rawRows.length ? supabase.from("product_reviews").select("id, purchase_request_id, rating, created_at").in("purchase_request_id", rawRows.map((item) => item.id)).limit(500) : Promise.resolve({ data: [] }),
      ]);
      if (messagesError) console.warn("Riwayat chat transaksi gagal dimuat:", messagesError.message);

      const senderIds = [...new Set([...(messages || []), ...(legacyRekberMessages || [])].map((message) => message.sender_id).filter(Boolean))];
      const { data: senders } = senderIds.length
        ? await supabase.from("profiles").select("id, display_name, avatar_url, is_seller, is_verified, is_midman, is_owner").in("id", senderIds).limit(100)
        : { data: [] };
      const groupedMessages = (messages || []).reduce((acc, message) => {
        acc[message.thread_id] = [...(acc[message.thread_id] || []), message];
        return acc;
      }, {});
      const groupedRekberMessages = (legacyRekberMessages || []).reduce((acc, message) => {
        acc[message.group_id] = [...(acc[message.group_id] || []), { ...message, visibility: "rekber_group" }];
        return acc;
      }, {});
      const groupedMmReviews = (mmReviews || []).reduce((acc, review) => {
        acc[review.group_id] = [...(acc[review.group_id] || []), review];
        return acc;
      }, {});
      const groupedProductReviews = (productReviews || []).reduce((acc, review) => {
        acc[review.purchase_request_id] = review;
        return acc;
      }, {});

      if (!active) return;
      setItems(rawRows);
      setMessagesByThread(groupedMessages);
      setRekberMessagesByGroup(groupedRekberMessages);
      setMessageProfiles(Object.fromEntries((senders || []).map((profile) => [profile.id, profile])));
      setThirdPartyProfiles(Object.fromEntries((thirdPartyProfiles || []).map((profile) => [profile.id, profile])));
      setMmReviewsByGroup(groupedMmReviews);
      setProductReviewsByRequest(groupedProductReviews);
      setLoading(false);
    }

    loadTransactions(true);
    const scheduleReload = () => {
      window.clearTimeout(reloadTimer);
      reloadTimer = window.setTimeout(() => loadTransactions(false), 180);
    };
    const channel = supabase.channel(`transactions_history_${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "purchase_requests" }, scheduleReload)
      .on("postgres_changes", { event: "*", schema: "public", table: "rekber_groups" }, scheduleReload)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages" }, scheduleReload)
      .on("postgres_changes", { event: "*", schema: "public", table: "rekber_messages" }, scheduleReload)
      .on("postgres_changes", { event: "*", schema: "public", table: "product_reviews" }, scheduleReload)
      .on("postgres_changes", { event: "*", schema: "public", table: "rekber_third_party_reviews" }, scheduleReload)
      .subscribe();

    return () => {
      active = false;
      window.clearTimeout(reloadTimer);
      supabase.removeChannel(channel);
    };
  }, [user]);

  if (!user) return <main className="container empty-state"><h2>Masuk untuk melihat transaksi</h2><p>Riwayat pembelian dan penjualanmu akan tersimpan di sini.</p></main>;
  if (loading) return <main className="container"><div className="skeleton" style={{ height: 280, marginTop: 24 }} /></main>;

  return (
    <main className="container transactions-page">
      <div className="transactions-heading"><span className="section-kicker">Riwayat transaksi</span><h1 className="page-title">Transaksi</h1><p className="page-subtitle">Riwayat lengkap dari permintaan beli sampai proses selesai.</p></div>
      {!items.length ? <div className="empty-state"><p>Belum ada transaksi yang selesai.</p></div> : (
        <div className="transaction-list">
          {items.map((item) => {
            const group = item.rekber_group;
            const isBuyer = item.buyer_id === user.id;
            const isMidman = group?.third_party_id === user.id;
            const isRekber = Boolean(group);
            const messages = [...(messagesByThread[item.thread_id] || []), ...(rekberMessagesByGroup[group?.id] || [])].sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
            const itemQuantity = Math.max(1, Number(item.item_quantity || 1));
            const finalPrice = Number(item.final_price || 0);
            const unitPrice = finalPrice / itemQuantity;
            const transactionDate = item.completed_at || group?.custody_completed_at || group?.released_at || item.seller_done_at || item.created_at;
            const productRating = item.buyer_rating || productReviewsByRequest[item.id]?.rating || 0;
            const mmProfile = group?.third_party_id ? (group.third_party_id === user.id ? { id: user.id, display_name: "Kamu", is_midman: true } : thirdPartyProfiles[group.third_party_id]) : null;
            const mmReviews = reviewSummary(mmReviewsByGroup[group?.id]);
            const seller = item.seller || { id: item.seller_id, display_name: "Seller" };
            const buyer = item.buyer || { id: item.buyer_id, display_name: "Buyer" };
            return (
              <article className={`transaction-card ${isRekber ? "is-rekber-transaction" : "is-direct-transaction"}`} key={item.id}>
                <Link to={`/produk/${item.product?.slug || ""}`} className="transaction-product">
                  {item.product?.image_url ? <img src={item.product.image_url} alt="" /> : <span className="transaction-product-fallback">P</span>}
                  <span><strong>{item.product?.name || "Produk"}</strong><small>{item.product?.category || "Produk digital"} · Buka detail produk</small></span>
                </Link>
                <div className="transaction-summary"><span className="status-pill status-completed">Selesai</span><strong>{isBuyer ? "Dibeli dari Seller" : isMidman ? "Kamu menjadi Midman (MM)" : "Terjual ke Buyer"}</strong></div>
                {isRekber && <div className="transaction-rekber-meta"><span><small>Kode Rekber</small><strong>{group.code || "-"}</strong></span><span><small>Alur</small><strong>Buyer · Seller · Midman (MM)</strong></span><span><small>Status custody</small><strong>{group.workflow_status === "released" ? "Custody selesai" : "Transaksi selesai"}</strong></span></div>}
                <details className="transaction-chat-history">
                  <summary>{isRekber ? "Riwayat chat 3 pihak & whisper" : "Riwayat chat"} ({messages.length} pesan)</summary>
                  <small className="transaction-chat-note">Rekaman chat selama proses transaksi, termasuk foto, QRIS, chat utama, dan whisper.</small>
                  <div className="transaction-chat-lines">
                    {messages.length ? messages.map((message) => {
                      const sender = message.sender_id === user.id ? "Kamu" : messageProfiles[message.sender_id]?.display_name || "Pengguna";
                      const attachment = message.attachment_url ? <a href={message.attachment_url} target="_blank" rel="noreferrer">{messageText(message)}</a> : messageText(message);
                      return <div key={message.id} className={message.sender_id === user.id ? "is-mine" : "is-theirs"}><span><strong>{sender}</strong><em>{visibilityLabel(message.visibility)}</em>{attachment}</span><time>{formatDate(message.created_at)}</time></div>;
                    }) : <p>Tidak ada pesan yang dapat ditampilkan.</p>}
                  </div>
                </details>
                <div className="transaction-bottom-grid">
                  <div><small>Harga : jumlah</small><strong>Rp{finalPrice.toLocaleString("id-ID")} : {itemQuantity}</strong><span className="transaction-unit-price">Rp{unitPrice.toLocaleString("id-ID", { maximumFractionDigits: 2 })} / barang</span></div>
                  <div><small>{isMidman ? "Tanggal proses" : isBuyer ? "Tanggal dibeli" : "Tanggal terjual"}</small><strong>{formatDate(transactionDate)}</strong></div>
                  <div><small>Rating produk</small><span className="transaction-stars">{stars(productRating)} <b>{productRating || 0}/5</b></span><Link to={`/toko/${seller.id || item.seller_id}`} className="transaction-seller-meta transaction-seller-link" aria-label={`Buka toko ${seller.display_name || "Seller"}`}><strong>{seller.display_name || "Seller"}</strong><RoleBadge profile={seller} size={14} /></Link></div>
                  <div className="transaction-participant-meta"><small>Buyer</small><strong>{buyer.display_name || "Buyer"}</strong></div>
                  {isRekber && <div className="transaction-third-party-meta"><small>Midman (MM) Rekber</small><strong>{isMidman ? "Kamu" : group.third_party_id ? (mmProfile?.display_name || "Midman (MM)") : "Midman (MM)"}</strong><span>{group.third_party_kind === "midman" ? "⚖️ Midman (MM)" : group.third_party_kind === "verified" ? "Verified MM" : "Pengguna biasa · Midman (MM)"}</span>{mmReviews.count > 0 && <span className="transaction-mm-rating">Rating MM: {stars(mmReviews.average)} <b>{mmReviews.average.toFixed(1)}/5 ({mmReviews.count})</b></span>}</div>}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}
