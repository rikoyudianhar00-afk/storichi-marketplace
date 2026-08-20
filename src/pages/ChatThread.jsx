import { Link, useParams } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import PurchaseRequestCard from "../components/PurchaseRequestCard";
import AttachmentButton from "../components/AttachmentButton";
import { markChatThreadRead } from "../lib/chatNotifications";
import { moderateMessage } from "../lib/moderation";
import { compressImageForChat, validateImageFile } from "../lib/image";
import ImageLightbox from "../components/ImageLightbox";
import { supabase } from "../lib/supabase";

function formatMessageTime(value) {
  return new Date(value).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

export default function ChatThread() {
  const { threadId } = useParams();
  const { user, profile: currentProfile, refreshProfile } = useAuth();
  const [thread, setThread] = useState(null);
  const [participant, setParticipant] = useState(null);
  const [messages, setMessages] = useState([]);
  const [request, setRequest] = useState(null);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [chatError, setChatError] = useState("");
  const [moderationNotice, setModerationNotice] = useState("");
  const [ratingOpen, setRatingOpen] = useState(true);
  const [selectedRating, setSelectedRating] = useState(0);
  const [ratingComment, setRatingComment] = useState("");
  const [busyAction, setBusyAction] = useState(false);
  const [doneConfirmOpen, setDoneConfirmOpen] = useState(false);
  const [pricePromptOpen, setPricePromptOpen] = useState(false);
  const [finalPrice, setFinalPrice] = useState("");
  const [skipDoneConfirm, setSkipDoneConfirm] = useState(false);
  const [productCollapsed, setProductCollapsed] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState(null);
  const [qrisUploadOpen, setQrisUploadOpen] = useState(false);
  const [qrisFile, setQrisFile] = useState(null);
  const [qrisPreviewUrl, setQrisPreviewUrl] = useState("");
  const [qrisError, setQrisError] = useState("");
  const [qrisBusy, setQrisBusy] = useState(false);
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
        supabase.from("profiles").select("id, display_name, avatar_url, bio, qris_url, is_verified, is_owner, is_seller").eq("id", participantId).maybeSingle(),
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
    const messageChannel = supabase.channel(`chat_thread_${threadId}`).on("postgres_changes", { event: "*", schema: "public", table: "chat_messages", filter: `thread_id=eq.${threadId}` }, (payload) => {
      if (payload.eventType === "INSERT") {
        setMessages((prev) => (prev.some((message) => message.id === payload.new.id) ? prev : [...prev, payload.new]));
        if (payload.new.sender_id !== user.id) markChatThreadRead(user.id, threadId);
      } else if (payload.eventType === "UPDATE") {
        setMessages((prev) => prev.map((message) => (message.id === payload.new.id ? { ...message, ...payload.new } : message)));
      }
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

  function openLightbox(url) {
    setLightboxUrl(url);
  }

  function closeLightbox() {
    setLightboxUrl(null);
  }

  const isBuyer = Boolean(request && user?.id === request.buyer_id);
  const isSeller = Boolean(request && user?.id === request.seller_id);
  const isDirect = request?.purchase_mode === "direct";
  const waitingForBuyerRating = isDirect && isBuyer && request?.rating_requested_at && !request?.buyer_rating;
  const sellerCanSendQris = isDirect && isSeller && request?.status === "approved" && !request?.qris_sent_at && !request?.buyer_rating;
  const sellerCanRequestRating = isDirect && isSeller && request?.status === "approved" && request?.qris_sent_at && !request?.rating_requested_at && !request?.buyer_rating;
  const sellerCanComplete = isDirect && isSeller && request?.status === "approved" && Boolean(request?.buyer_rating);
  const chatCompleted = request?.status === "completed";
  const chatLocked = Boolean(waitingForBuyerRating || chatCompleted);

  async function sendMessage(e) {
    e.preventDefault();
    if (chatCompleted) {
      setChatError("Transaksi ini sudah selesai dan tidak dapat diubah lagi.");
      return;
    }
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

  function chooseQrisFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const fileError = validateImageFile(file);
    if (fileError) {
      setQrisError(fileError);
      return;
    }
    setQrisError("");
    setQrisFile(file);
    setQrisPreviewUrl(URL.createObjectURL(file));
  }

  function resetQrisUpload() {
    if (qrisPreviewUrl) URL.revokeObjectURL(qrisPreviewUrl);
    setQrisFile(null);
    setQrisPreviewUrl("");
    setQrisError("");
  }

  async function sendQrisMessage(qrisUrl) {
    setQrisBusy(true);
    setBusyAction(true);
    setChatError("");
    const { data: qrisMessage, error: qrisErrorResult } = await supabase.rpc("send_direct_purchase_qris", { p_request_id: request.id, p_qris_url: qrisUrl });
    if (qrisErrorResult) {
      setQrisBusy(false);
      setBusyAction(false);
      setChatError(qrisErrorResult.message || "QRIS gagal diberikan.");
      return;
    }
    setQrisBusy(false);
    setBusyAction(false);
    const sentAt = qrisMessage?.created_at || new Date().toISOString();
    setRequest((prev) => ({ ...prev, qris_sent_at: sentAt }));
    setQrisUploadOpen(false);
    resetQrisUpload();
  }

  async function handleGiveQris() {
    if (!request || !isSeller) return;
    if (!qrisFile && currentProfile?.qris_url) {
      await sendQrisMessage(currentProfile.qris_url);
      return;
    }
    if (!qrisFile) {
      setQrisUploadOpen(true);
      return;
    }
    setQrisBusy(true);
    setQrisError("");
    try {
      const uploadFile = await compressImageForChat(qrisFile, 100 * 1024);
      if (uploadFile.size > 100 * 1024) {
        setQrisError("QRIS masih terlalu besar setelah dikompres. Pilih gambar lain.");
        return;
      }
      const path = `${user.id}/qris-${Date.now()}-${crypto.randomUUID?.() || Math.random().toString(36).slice(2)}.jpg`;
      const { error: uploadError } = await supabase.storage.from("chat-attachments").upload(path, uploadFile, { contentType: "image/jpeg", upsert: false });
      if (uploadError) {
        setQrisError("QRIS gagal diunggah.");
        return;
      }
      const { data: publicData } = supabase.storage.from("chat-attachments").getPublicUrl(path);
      const { error: profileError } = await supabase.from("profiles").update({ qris_url: publicData.publicUrl, qris_updated_at: new Date().toISOString() }).eq("id", user.id);
      if (profileError) {
        setQrisError("QRIS terunggah, tetapi belum dapat ditetapkan sebagai QR toko.");
        return;
      }
      await refreshProfile?.();
      await sendQrisMessage(publicData.publicUrl);
    } catch {
      setQrisError("QRIS tidak dapat diproses. Pilih gambar yang valid.");
    } finally {
      setQrisBusy(false);
    }
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
    const { data: moderationNoticeResult, error } = await supabase.rpc("complete_direct_purchase", { p_request_id: request.id, p_final_price: parsedPrice });
    setBusyAction(false);
    if (error) return setChatError(error.message || "Transaksi belum dapat diselesaikan.");
    if (moderationNoticeResult) setModerationNotice(moderationNoticeResult);
    setRequest((prev) => ({ ...prev, status: "completed", final_price: parsedPrice, completed_at: new Date().toISOString(), seller_done_at: new Date().toISOString() }));
    setPricePromptOpen(false);
  }

  if (!user) return <main className="container empty-state"><h2>Masuk untuk membuka chat</h2></main>;
  if (loading) return <main className="chat-thread-page"><div className="skeleton" style={{ height: "70vh" }} /></main>;
  if (!thread) return <main className="container empty-state"><p>Percakapan tidak ditemukan.</p></main>;

  return (
    <main className="chat-thread-page">
      {chatCompleted && <div className="chat-completed-overlay" aria-label="Transaksi selesai dan terkunci"><div className="chat-completed-mark" aria-hidden="true">✓</div><strong>Transaksi selesai</strong><span>Proses ini sudah selesai dan tidak dapat diubah lagi.</span></div>}

      <header className="chat-conversation-header">
        <Link to="/chat" className="chat-back-button" aria-label="Kembali ke daftar chat">←</Link>
        <Link to={`/toko/${participant?.id || ""}`} className="chat-conversation-avatar" aria-label={`Buka toko ${participant?.display_name || "pengguna"}`} title="Buka toko pengguna">{participant?.avatar_url ? <img src={participant.avatar_url} alt="" /> : <span>{participant?.display_name?.[0] || "U"}</span>}</Link>
        <div className="chat-conversation-info"><strong>{participant?.display_name || "Pengguna"}</strong><span>{thread.product?.name || "Percakapan umum"}</span></div>
        <span className="chat-online-dot" title="Percakapan aman" />
      </header>

      {request && <div className={`chat-request-wrap ${productCollapsed ? "is-collapsed" : ""}`}>
        <button type="button" className="chat-product-collapse" onClick={() => setProductCollapsed((value) => !value)} aria-expanded={!productCollapsed}>
          <span>{productCollapsed ? "Produk yang dibeli" : "Perkecil kartu produk"}</span><span aria-hidden="true">{productCollapsed ? "⌄" : "⌃"}</span>
        </button>
        {!productCollapsed && <PurchaseRequestCard request={{ ...request, product: request.product || thread.product }} isSeller={isSeller} currentUserId={user.id} onUpdate={setRequest} />}
        {productCollapsed && <Link to={`/produk/${request.product?.slug || thread.product?.slug || ""}`} className="chat-product-collapsed-title">{request.product?.name || thread.product?.name || "Produk"}</Link>}
      </div>}

      <div className="chat-messages" aria-live="polite">
        <div className="chat-day-label">Percakapan Storichi</div>
        {messages.map((message) => (
          <div key={message.id} className={`chat-message-row ${message.sender_id === user.id ? "is-mine" : "is-theirs"} ${message.attachment_type === "qris" ? "is-qris" : ""} ${message.attachment_type === "system" ? "is-system" : ""}`}>
            <div className={`chat-bubble ${message.attachment_type === "qris" ? "chat-qris-bubble" : ""} ${message.attachment_type === "system" ? "chat-system-bubble" : ""}`}>
              {message.attachment_type === "qris" && message.attachment_url ? (
                <div className="chat-qris-card">
                  <strong>QRIS dari {message.sender_id === user.id ? (currentProfile?.display_name || "Penjual") : (participant?.display_name || "Penjual")}</strong>
                  <button type="button" className="chat-image-button chat-qris-image-button" onClick={() => openLightbox(message.attachment_url)} aria-label="Buka QRIS dan zoom"><img src={message.attachment_url} alt="QRIS pembayaran, ketuk untuk memperbesar" className="chat-attachment-media" /></button>
                  <small>Scan QRIS ini untuk melanjutkan pembayaran</small>
                </div>
              ) : message.attachment_url ? (message.attachment_type === "video" ? <video src={message.attachment_url} controls className="chat-attachment-media" /> : <button type="button" className="chat-image-button" onClick={() => openLightbox(message.attachment_url)} aria-label="Buka gambar pesan dan zoom"><img src={message.attachment_url} alt="Lampiran gambar pesan, ketuk untuk membuka dan memperbesar" className="chat-attachment-media" /></button>) : <span>{message.content}</span>}
              <time dateTime={message.created_at}>{formatMessageTime(message.created_at)}{message.sender_id === user.id && <span className={`chat-message-read-state ${message.read_at ? "is-read" : ""}`} title={message.read_at ? "Telah terbaca" : "Terkirim"}>{message.read_at ? " ✓✓" : " ✓"}</span>}</time>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <ImageLightbox
        src={lightboxUrl}
        alt="Lampiran gambar chat ukuran besar"
        open={Boolean(lightboxUrl)}
        onClose={closeLightbox}
      />

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

      {sellerCanSendQris && <button type="button" className="chat-qris-trigger" disabled={busyAction || qrisBusy} onClick={handleGiveQris} title="Berikan QRIS kepada pembeli">▣ <span>{currentProfile?.qris_url ? "Berikan QRIS" : "Siapkan & berikan QRIS"}</span></button>}
      {sellerCanRequestRating && <button type="button" className="chat-rating-trigger" disabled={busyAction} onClick={requestRating} title="Minta rating pembeli">☆ <span>Minta rating</span></button>}
      {waitingForBuyerRating && !ratingOpen && <button type="button" className="chat-rating-trigger" onClick={() => setRatingOpen(true)}>☆ <span>Beri rating produk</span></button>}
      {sellerCanComplete && <button type="button" className="chat-done-trigger" disabled={busyAction} onClick={openDoneFlow}>DONE</button>}

      {qrisUploadOpen && (
        <div className="direct-action-modal" role="dialog" aria-modal="true" aria-label="Siapkan QRIS toko">
          <div className="direct-action-modal-card qris-upload-modal">
            <h3>Siapkan QRIS toko</h3>
            <p>Upload QRIS satu kali. Setelah ditetapkan, QRIS ini tersimpan sebagai QR toko dan langsung dikirim ke pembeli. Permintaan rating dilakukan seller melalui tombol terpisah setelah QRIS terkirim.</p>
            <label className="qris-file-picker">{qrisPreviewUrl ? <img src={qrisPreviewUrl} alt="Pratinjau QRIS" /> : <span>Ketuk untuk memilih gambar QRIS</span>}<input type="file" accept="image/*" onChange={chooseQrisFile} /></label>
            {qrisError && <p className="form-error" role="alert">{qrisError}</p>}
            <div className="direct-action-modal-actions"><button type="button" className="btn btn-outline" onClick={() => { setQrisUploadOpen(false); resetQrisUpload(); }}>Batal</button><button type="button" className="btn btn-primary" disabled={!qrisFile || qrisBusy} onClick={handleGiveQris}>{qrisBusy ? "Menyiapkan..." : "Tetapkan QR toko & kirim"}</button></div>
          </div>
        </div>
      )}

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

      {moderationNotice && <div className="chat-moderation-warning" role="alert">{moderationNotice}</div>}
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
