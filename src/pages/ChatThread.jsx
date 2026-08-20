import { Link, useParams } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import PurchaseRequestCard from "../components/PurchaseRequestCard";
import AttachmentButton from "../components/AttachmentButton";
import { markChatThreadRead } from "../lib/chatNotifications";
import { moderateMessage } from "../lib/moderation";
import { supabase } from "../lib/supabase";

function formatMessageTime(value) {
  return new Date(value).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

export default function ChatThread() {
  const { threadId } = useParams();
  const { user } = useAuth();
  const [thread, setThread] = useState(null);
  const [participant, setParticipant] = useState(null);
  const [messages, setMessages] = useState([]);
  const [request, setRequest] = useState(null);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [chatError, setChatError] = useState("");
  const [ratingOpen, setRatingOpen] = useState(true);
  const [selectedRating, setSelectedRating] = useState(0);
  const [ratingComment, setRatingComment] = useState("");
  const [busyAction, setBusyAction] = useState(false);
  const [doneConfirmOpen, setDoneConfirmOpen] = useState(false);
  const [pricePromptOpen, setPricePromptOpen] = useState(false);
  const [finalPrice, setFinalPrice] = useState("");
  const [skipDoneConfirm, setSkipDoneConfirm] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    if (!user || !threadId) return undefined;
    let active = true;

    async function load() {
      const { data: threadData } = await supabase
        .from("chat_threads")
        .select("*, product:products(id, slug, name, image_url, category, price_from)")
        .eq("id", threadId)
        .maybeSingle();
      if (!threadData || (threadData.user_a !== user.id && threadData.user_b !== user.id)) {
        if (active) setLoading(false);
        return;
      }
      const participantId = threadData.user_a === user.id ? threadData.user_b : threadData.user_a;
      const [{ data: msgs }, { data: req }, { data: profile }] = await Promise.all([
        supabase.from("chat_messages").select("*").eq("thread_id", threadId).order("created_at", { ascending: true }),
        supabase.from("purchase_requests").select("*, product:products(id, slug, name, image_url, category, price_from)").eq("thread_id", threadId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("profiles").select("id, display_name, avatar_url, is_verified, is_owner").eq("id", participantId).maybeSingle(),
      ]);
      await markChatThreadRead(user.id, threadId);
      if (active) {
        setThread(threadData);
        setParticipant(profile);
        setMessages(msgs || []);
        setRequest(req || null);
        setFinalPrice(req?.final_price || req?.product?.price_from || "");
        setLoading(false);
      }
    }

    load();
    const messageChannel = supabase.channel(`chat_thread_${threadId}`).on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages", filter: `thread_id=eq.${threadId}` }, (payload) => {
      setMessages((prev) => (prev.some((message) => message.id === payload.new.id) ? prev : [...prev, payload.new]));
      if (payload.new.sender_id !== user.id) markChatThreadRead(user.id, threadId);
    }).subscribe();
    const requestChannel = supabase.channel(`purchase_request_${threadId}`).on("postgres_changes", { event: "UPDATE", schema: "public", table: "purchase_requests", filter: `thread_id=eq.${threadId}` }, (payload) => {
      setRequest((prev) => ({ ...(prev || {}), ...payload.new }));
    }).subscribe();
    return () => {
      active = false;
      supabase.removeChannel(messageChannel);
      supabase.removeChannel(requestChannel);
    };
  }, [threadId, user]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const isBuyer = Boolean(request && user?.id === request.buyer_id);
  const isSeller = Boolean(request && user?.id === request.seller_id);
  const isDirect = request?.purchase_mode === "direct";
  const waitingForBuyerRating = isDirect && isBuyer && request?.rating_requested_at && !request?.buyer_rating;
  const sellerCanRequestRating = isDirect && isSeller && request?.status === "approved" && !request?.rating_requested_at && !request?.buyer_rating;
  const sellerCanComplete = isDirect && isSeller && request?.status === "approved" && Boolean(request?.buyer_rating);
  const chatLocked = Boolean(waitingForBuyerRating);

  async function sendMessage(e) {
    e.preventDefault();
    if (chatLocked) {
      setChatError("Berikan rating produk terlebih dahulu untuk melanjutkan chat.");
      return;
    }
    if (!text.trim() || !user) return;
    const result = moderateMessage(text);
    if (!result.allowed) {
      setChatError(result.message);
      return;
    }
    setChatError("");
    setText("");
    const { error } = await supabase.from("chat_messages").insert({ thread_id: threadId, sender_id: user.id, content: result.value });
    if (error) setChatError("Pesan gagal dikirim. Coba lagi.");
  }

  async function sendAttachment({ url, type, sizeBytes }) {
    if (!user || chatLocked) return;
    setChatError("");
    const { error } = await supabase.from("chat_messages").insert({ thread_id: threadId, sender_id: user.id, content: type === "video" ? "Video" : "Gambar", attachment_url: url, attachment_type: type, attachment_size_bytes: sizeBytes || null });
    if (error) setChatError("Lampiran gagal dikirim.");
  }

  async function requestRating() {
    setBusyAction(true);
    setChatError("");
    const { error } = await supabase.rpc("request_direct_rating", { p_request_id: request.id });
    setBusyAction(false);
    if (error) return setChatError(error.message || "Permintaan rating gagal dikirim.");
    setRequest((prev) => ({ ...prev, rating_requested_at: new Date().toISOString() }));
  }

  async function submitRating() {
    if (!selectedRating) return setChatError("Pilih bintang terlebih dahulu.");
    setBusyAction(true);
    setChatError("");
    const { error } = await supabase.rpc("submit_direct_rating", { p_request_id: request.id, p_rating: selectedRating, p_comment: ratingComment.trim() || null });
    setBusyAction(false);
    if (error) return setChatError(error.message || "Rating gagal disimpan.");
    setRequest((prev) => ({ ...prev, buyer_rating: selectedRating, buyer_rating_comment: ratingComment, rating_requested_at: null }));
    setRatingOpen(false);
    setSelectedRating(0);
    setRatingComment("");
  }

  function openDoneFlow() {
    const dismissed = typeof window !== "undefined" && window.localStorage.getItem("storichi_done_confirm_dismissed") === "1";
    if (dismissed) setPricePromptOpen(true);
    else setDoneConfirmOpen(true);
  }

  function continueDoneFlow() {
    if (skipDoneConfirm && typeof window !== "undefined") window.localStorage.setItem("storichi_done_confirm_dismissed", "1");
    setDoneConfirmOpen(false);
    setPricePromptOpen(true);
  }

  async function completePurchase() {
    const parsedPrice = Number(finalPrice);
    if (!parsedPrice || parsedPrice <= 0) return setChatError("Masukkan harga item yang valid.");
    setBusyAction(true);
    setChatError("");
    const { error } = await supabase.rpc("complete_direct_purchase", { p_request_id: request.id, p_final_price: parsedPrice });
    setBusyAction(false);
    if (error) return setChatError(error.message || "Transaksi belum dapat diselesaikan.");
    setRequest((prev) => ({ ...prev, status: "completed", final_price: parsedPrice, completed_at: new Date().toISOString(), seller_done_at: new Date().toISOString() }));
    setPricePromptOpen(false);
  }

  if (!user) return <main className="container empty-state"><h2>Masuk untuk membuka chat</h2></main>;
  if (loading) return <main className="chat-thread-page"><div className="skeleton" style={{ height: "70vh" }} /></main>;
  if (!thread) return <main className="container empty-state"><p>Percakapan tidak ditemukan.</p></main>;

  return (
    <main className="chat-thread-page">
      <header className="chat-conversation-header">
        <Link to="/chat" className="chat-back-button" aria-label="Kembali ke daftar chat">←</Link>
        <div className="chat-conversation-avatar">{participant?.avatar_url ? <img src={participant.avatar_url} alt="" /> : <span>{participant?.display_name?.[0] || "U"}</span>}</div>
        <div className="chat-conversation-info"><strong>{participant?.display_name || "Pengguna"}</strong><span>{thread.product?.name || "Percakapan umum"}</span></div>
        <span className="chat-online-dot" title="Percakapan aman" />
      </header>

      {request && <div className="chat-request-wrap"><PurchaseRequestCard request={{ ...request, product: request.product || thread.product }} isSeller={isSeller} currentUserId={user.id} onUpdate={setRequest} /></div>}

      <div className="chat-messages" aria-live="polite">
        <div className="chat-day-label">Percakapan Storichi</div>
        {messages.map((message) => (
          <div key={message.id} className={`chat-message-row ${message.sender_id === user.id ? "is-mine" : "is-theirs"}`}>
            <div className="chat-bubble">
              {message.attachment_url ? (message.attachment_type === "video" ? <video src={message.attachment_url} controls className="chat-attachment-media" /> : <img src={message.attachment_url} alt="Lampiran pesan" className="chat-attachment-media" />) : <span>{message.content}</span>}
              <time dateTime={message.created_at}>{formatMessageTime(message.created_at)}</time>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {waitingForBuyerRating && ratingOpen && (
        <section className="direct-rating-popup" aria-label="Beri rating produk">
          <div className="direct-rating-popup-head"><strong>Bagaimana produk ini?</strong><span>Pilih bintang untuk membuka chat</span></div>
          <div className="direct-rating-stars">
            {[1, 2, 3, 4, 5].map((value) => <button type="button" key={value} className={value <= selectedRating ? "is-selected" : ""} onClick={() => setSelectedRating(value)} aria-label={`${value} bintang`}>★</button>)}
          </div>
          {selectedRating > 0 && <input value={ratingComment} onChange={(e) => setRatingComment(e.target.value)} placeholder="Komentar singkat (opsional)" />}
          <button type="button" className="btn btn-primary btn-full" disabled={!selectedRating || busyAction} onClick={submitRating}>{busyAction ? "Menyimpan..." : "Kirim rating"}</button>
        </section>
      )}

      {sellerCanRequestRating && <button type="button" className="chat-rating-trigger" disabled={busyAction} onClick={requestRating} title="Minta rating pembeli">☆ <span>Minta rating</span></button>}
      {waitingForBuyerRating && !ratingOpen && <button type="button" className="chat-rating-trigger" onClick={() => setRatingOpen(true)}>☆ <span>Beri rating produk</span></button>}
      {sellerCanComplete && <button type="button" className="chat-done-trigger" disabled={busyAction} onClick={openDoneFlow}>DONE</button>}

      {doneConfirmOpen && (
        <div className="direct-action-modal" role="dialog" aria-modal="true">
          <div className="direct-action-modal-card"><h3>Selesaikan transaksi?</h3><p>Pastikan item sudah diterima dan pembeli sudah memberikan rating. Setelah DONE, transaksi akan masuk ke riwayat.</p><label><input type="checkbox" checked={skipDoneConfirm} onChange={(e) => setSkipDoneConfirm(e.target.checked)} /> Jangan tampilkan lagi</label><div className="direct-action-modal-actions"><button type="button" className="btn btn-outline" onClick={() => setDoneConfirmOpen(false)}>Batal</button><button type="button" className="btn btn-primary" onClick={continueDoneFlow}>Lanjut</button></div></div>
        </div>
      )}
      {pricePromptOpen && (
        <div className="direct-action-modal" role="dialog" aria-modal="true">
          <div className="direct-action-modal-card"><h3>Harga item terjual</h3><p>Masukkan harga final yang akan dicatat untuk pembeli dan penjual.</p><input type="number" min="1" value={finalPrice} onChange={(e) => setFinalPrice(e.target.value)} placeholder="Contoh: 100000" /><div className="direct-action-modal-actions"><button type="button" className="btn btn-outline" onClick={() => setPricePromptOpen(false)}>Batal</button><button type="button" className="btn btn-primary" disabled={busyAction} onClick={completePurchase}>{busyAction ? "Menyimpan..." : "Selesaikan"}</button></div></div>
        </div>
      )}

      {chatError && <div className="chat-moderation-notice" role="alert">{chatError}</div>}
      <div className={`chat-composer-shell ${chatLocked ? "is-locked" : ""}`}>
        <form className="chat-input-bar" onSubmit={sendMessage}>
          <AttachmentButton userId={user.id} onUploaded={sendAttachment} disabled={chatLocked} />
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder={chatLocked ? "Beri rating sebelum chat..." : "Tulis pesan..."} aria-label="Tulis pesan" disabled={chatLocked} />
          <button type="submit" className="chat-send-button" disabled={chatLocked || !text.trim()} aria-label="Kirim pesan">↑</button>
        </form>
      </div>
    </main>
  );
}
