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
  const [rekberGroup, setRekberGroup] = useState(null);
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
  const [itemQuantity, setItemQuantity] = useState("1");
  const [rekberPricePromptOpen, setRekberPricePromptOpen] = useState(false);
  const [rekberFinalPrice, setRekberFinalPrice] = useState("");
  const [rekberItemQuantity, setRekberItemQuantity] = useState("1");
  const [skipDoneConfirm, setSkipDoneConfirm] = useState(false);
  const [productCollapsed, setProductCollapsed] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState(null);
  const [completedHistoryRevealed, setCompletedHistoryRevealed] = useState(false);
  const [historySwipeOffset, setHistorySwipeOffset] = useState(0);
  const historySwipeRef = useRef(null);
  const [qrisUploadOpen, setQrisUploadOpen] = useState(false);
  const [qrisFile, setQrisFile] = useState(null);
  const [qrisPreviewUrl, setQrisPreviewUrl] = useState("");
  const [qrisError, setQrisError] = useState("");
  const [qrisBusy, setQrisBusy] = useState(false);
  const [qrisUploadMode, setQrisUploadMode] = useState("seller");
  const bottomRef = useRef(null);
  const [whisperTextSeller, setWhisperTextSeller] = useState("");
  const [whisperTextBuyer, setWhisperTextBuyer] = useState("");
  const [whisperTextSingle, setWhisperTextSingle] = useState("");
  const [whisperMinimized, setWhisperMinimized] = useState({ seller: false, buyer: false, single: false });
  const [rekberReviewCount, setRekberReviewCount] = useState(0);
  const [rekberRatingOpen, setRekberRatingOpen] = useState(false);
  const [rekberProductRating, setRekberProductRating] = useState(0);
  const [rekberThirdPartyRating, setRekberThirdPartyRating] = useState(0);
  const [rekberRatingComment, setRekberRatingComment] = useState("");
  const [rekberRatingSubmitted, setRekberRatingSubmitted] = useState(false);
  const [rekberThirdPartyProfile, setRekberThirdPartyProfile] = useState(null);
  const [rekberBuyerProfile, setRekberBuyerProfile] = useState(null);

  useEffect(() => {
    if (!user || !threadId) return undefined;
    let active = true;

    async function load() {
      const { data: threadData } = await supabase
        .from("chat_threads")
        .select("*, product:products(id, slug, name, image_url, category, price_from, seller_id)")
        .eq("id", threadId)
        .maybeSingle();
      if (!threadData) {
        if (active) setLoading(false);
        return;
      }
      let { data: req, error: requestQueryError } = await supabase
        .from("purchase_requests")
        .select("*, product:products(id, slug, name, image_url, category, price_from, seller_id)")
        .eq("thread_id", threadId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (requestQueryError) {
        const fallbackRequest = await supabase.from("purchase_requests").select("*").eq("thread_id", threadId).order("created_at", { ascending: false }).limit(1).maybeSingle();
        req = fallbackRequest.data || null;
      }
      const isDirectParticipant = threadData.user_a === user.id || threadData.user_b === user.id;
      if (!req && threadData.product?.seller_id && user.id !== threadData.product.seller_id) {
        const { data: latestBuyerMessage } = await supabase.from("chat_messages").select("sender_id, content").eq("thread_id", threadId).order("created_at", { ascending: false }).limit(1).maybeSingle();
        const looksLikePurchaseRequest = latestBuyerMessage?.sender_id === user.id && /mau beli|ingin beli|ingin membeli|saya beli/i.test(latestBuyerMessage.content || "");
        if (looksLikePurchaseRequest) {
          const { data: restoredRequest } = await supabase.from("purchase_requests").insert({ product_id: threadData.product.id, buyer_id: user.id, seller_id: threadData.product.seller_id, thread_id: threadId, status: "pending" }).select("*, product:products(id, slug, name, image_url, category, price_from, seller_id)").single();
          req = restoredRequest || null;
        }
      }
      let group = null;
      if (req?.rekber_group_id) {
        const { data: membership } = await supabase
          .from("rekber_members")
          .select("group:rekber_groups(id, name, status, workflow_status, buyer_id, seller_id, midman_id, third_party_id, third_party_kind, activated_at, activated_by, buyer_done_at, seller_done_at, qris_to_third_party_sent_at, custody_completed_at, midman_qris_url, midman_qris_sent_at, custody_requested_at, midman_rating_requested_at)")
          .eq("group_id", req.rekber_group_id)
          .eq("user_id", user.id)
          .maybeSingle();
        group = membership?.group || null;
      }
      const isAllowedRekberParticipant = Boolean(group && ["active", "completed"].includes(group.status));
      if (!isDirectParticipant && !isAllowedRekberParticipant) {
        if (active) setLoading(false);
        return;
      }
      const participantId = isDirectParticipant
        ? (threadData.user_a === user.id ? threadData.user_b : threadData.user_a)
        : (req?.seller_id || threadData.user_a);
      const [{ data: msgs }, { data: profile }] = await Promise.all([
        supabase.from("chat_messages").select("*").eq("thread_id", threadId).order("created_at", { ascending: true }),
        supabase.from("profiles").select("id, display_name, avatar_url, bio, qris_url, is_verified, is_owner, is_seller").eq("id", participantId).maybeSingle(),
      ]);
      await markChatThreadRead(user.id, threadId);
      if (active) {
        setThread(threadData);
        setParticipant(profile);
        setRekberGroup(group);
        setMessages(msgs || []);
        setRequest(req || null);
        setFinalPrice(req?.final_price || req?.product?.price_from || "");
        setItemQuantity(String(req?.item_quantity || 1));
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
    const requestChannel = supabase.channel(`purchase_request_${threadId}`).on("postgres_changes", { event: "*", schema: "public", table: "purchase_requests", filter: `thread_id=eq.${threadId}` }, (payload) => {
      if (payload.eventType === "INSERT") setRequest((prev) => prev || payload.new);
      if (payload.eventType === "UPDATE") setRequest((prev) => ({ ...(prev || {}), ...payload.new }));
    }).subscribe();
    return () => {
      active = false;
      supabase.removeChannel(messageChannel);
      supabase.removeChannel(requestChannel);
    };
  }, [threadId, user]);

  useEffect(() => {
    if (!user || !request?.rekber_group_id) {
      setRekberGroup(null);
      return undefined;
    }
    let active = true;
    const groupSelect = "group:rekber_groups(id, name, status, workflow_status, buyer_id, seller_id, midman_id, third_party_id, third_party_kind, activated_at, activated_by, buyer_done_at, seller_done_at, qris_to_third_party_sent_at, custody_completed_at, midman_qris_url, midman_qris_sent_at, custody_requested_at, midman_rating_requested_at)";
    const loadGroup = async () => {
      const { data } = await supabase
        .from("rekber_members")
        .select(groupSelect)
        .eq("group_id", request.rekber_group_id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (active) setRekberGroup(data?.group || null);
    };
    loadGroup();
    const groupChannel = supabase.channel(`rekber-state-${request.rekber_group_id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "rekber_groups", filter: `id=eq.${request.rekber_group_id}` }, loadGroup)
      .subscribe();
    return () => {
      active = false;
      supabase.removeChannel(groupChannel);
    };
  }, [request?.rekber_group_id, user?.id]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  function openLightbox(url) {
    setLightboxUrl(url);
  }

  function closeLightbox() {
    setLightboxUrl(null);
  }

  const hasJoinedThreePartyChat = Boolean(rekberGroup?.third_party_id && ["active", "completed"].includes(rekberGroup.status));
  const isActiveRekber = Boolean(hasJoinedThreePartyChat && rekberGroup.status === "active");
  const isRekberThirdParty = Boolean(hasJoinedThreePartyChat && user?.id === rekberGroup?.third_party_id);
  const isBuyer = Boolean(request && user?.id === request.buyer_id);
  const isSeller = Boolean(request && user?.id === request.seller_id);
  const isDirect = request?.purchase_mode === "direct";
  const waitingForBuyerRating = isDirect && isBuyer && request?.rating_requested_at && !request?.buyer_rating;
  const sellerCanSendQris = isDirect && isSeller && request?.status === "approved" && !request?.qris_sent_at && !request?.buyer_rating;
  const sellerCanRequestRating = isDirect && isSeller && request?.status === "approved" && request?.qris_sent_at && !request?.rating_requested_at && !request?.buyer_rating;
  const sellerCanComplete = isDirect && isSeller && request?.status === "approved" && Boolean(request?.buyer_rating);
  const chatCompleted = request?.status === "completed";
  const chatLocked = Boolean(waitingForBuyerRating || chatCompleted);
  const isRekberCompleted = Boolean(rekberGroup && rekberGroup.status === "completed");
  const sellerWhisperMessages = messages.filter((message) => message.visibility === "seller_whisper");
  const buyerWhisperMessages = messages.filter((message) => message.visibility === "buyer_whisper");
  const mainChatMessages = messages.filter((message) => !message.visibility || message.visibility === "main");
  const displayedMainChatMessages = isRekberCompleted
    ? mainChatMessages.filter((message) => message.sender_id === rekberGroup?.third_party_id)
    : mainChatMessages;
  const isWhispering = Boolean((isActiveRekber && rekberGroup?.activated_at) || isRekberCompleted);

  useEffect(() => {
    if (!chatCompleted) {
      setCompletedHistoryRevealed(false);
      setHistorySwipeOffset(0);
    }
  }, [chatCompleted]);

  useEffect(() => {
    if (!rekberGroup?.third_party_id) {
      setRekberThirdPartyProfile(null);
      return undefined;
    }
    let active = true;
    supabase.from("profiles").select("id, display_name, avatar_url, bio, is_verified, is_midman, is_owner").eq("id", rekberGroup.third_party_id).maybeSingle().then(({ data }) => {
      if (active) setRekberThirdPartyProfile(data || null);
    });
    return () => { active = false; };
  }, [rekberGroup?.third_party_id]);

  useEffect(() => {
    if (!rekberGroup?.buyer_id) {
      setRekberBuyerProfile(null);
      return undefined;
    }
    let active = true;
    supabase.from("profiles").select("id, display_name, avatar_url, bio, is_verified, is_midman, is_owner").eq("id", rekberGroup.buyer_id).maybeSingle().then(({ data }) => {
      if (active) setRekberBuyerProfile(data || null);
    });
    return () => { active = false; };
  }, [rekberGroup?.buyer_id]);

  useEffect(() => {
    if (!rekberGroup?.id || !isWhispering || (!isBuyer && !isSeller)) {
      setRekberRatingSubmitted(false);
      return undefined;
    }
    let active = true;
    supabase.from("rekber_third_party_reviews").select("id").eq("group_id", rekberGroup.id).eq("reviewer_id", user.id).maybeSingle().then(({ data }) => {
      if (active) setRekberRatingSubmitted(Boolean(data));
    });
    return () => { active = false; };
  }, [rekberGroup?.id, isWhispering, isBuyer, isSeller, user?.id]);

  useEffect(() => {
    if (!rekberGroup?.id || !rekberGroup?.buyer_id || !rekberGroup?.seller_id || !rekberGroup?.midman_rating_requested_at) {
      setRekberReviewCount(0);
      return undefined;
    }
    let active = true;
    const loadReviews = async () => {
      const { data } = await supabase.from("rekber_third_party_reviews").select("id, reviewer_id").eq("group_id", rekberGroup.id).in("reviewer_id", [rekberGroup.buyer_id, rekberGroup.seller_id]);
      if (active) setRekberReviewCount((data || []).length);
    };
    loadReviews();
    const reviewChannel = supabase.channel(`rekber-reviews-${rekberGroup.id}`).on("postgres_changes", { event: "*", schema: "public", table: "rekber_third_party_reviews", filter: `group_id=eq.${rekberGroup.id}` }, loadReviews).subscribe();
    return () => { active = false; supabase.removeChannel(reviewChannel); };
  }, [rekberGroup?.id, rekberGroup?.buyer_id, rekberGroup?.seller_id, rekberGroup?.midman_rating_requested_at]);

  function handleHistorySwipeStart(event) {
    if (!chatCompleted || completedHistoryRevealed) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    historySwipeRef.current = { startX: event.clientX, moved: false };
  }

  function handleHistorySwipeMove(event) {
    const gesture = historySwipeRef.current;
    if (!gesture || completedHistoryRevealed) return;
    event.preventDefault();
    const offset = Math.max(0, Math.min(220, event.clientX - gesture.startX));
    gesture.moved = offset > 4;
    setHistorySwipeOffset(offset);
  }

  function handleHistorySwipeEnd() {
    const gesture = historySwipeRef.current;
    if (!gesture) return;
    if (historySwipeOffset >= 118) {
      setCompletedHistoryRevealed(true);
      setHistorySwipeOffset(0);
    } else {
      setHistorySwipeOffset(0);
    }
    historySwipeRef.current = null;
  }

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
    const { error } = await supabase.from("chat_messages").insert({ thread_id: threadId, sender_id: user.id, content: result.value, visibility: "main" });
    if (error) setChatError("Pesan gagal dikirim. Coba lagi.");
  }

  async function sendWhisperText(target, value, clear) {
    if (!isWhispering || chatCompleted || !user || !value.trim()) return;
    const result = moderateMessage(value);
    if (!result.allowed) {
      setChatError(result.message);
      return;
    }
    setChatError("");
    const { error } = await supabase.from("chat_messages").insert({ thread_id: threadId, sender_id: user.id, content: result.value, visibility: `${target}_whisper` });
    if (error) setChatError("Pesan whisper gagal dikirim. Coba lagi.");
    else clear("");
  }

  async function sendWhisperAttachment(target, { url, type, sizeBytes }) {
    if (!isWhispering || chatCompleted || !user) return;
    const { error } = await supabase.from("chat_messages").insert({ thread_id: threadId, sender_id: user.id, content: type === "video" ? "Video" : "Gambar", attachment_url: url, attachment_type: type, attachment_size_bytes: sizeBytes || null, visibility: `${target}_whisper` });
    if (error) setChatError("Lampiran whisper gagal dikirim.");
  }

  async function sendAttachment({ url, type, sizeBytes }) {
    if (!user || chatLocked) return;
    setChatError("");
    const { error } = await supabase.from("chat_messages").insert({ thread_id: threadId, sender_id: user.id, content: type === "video" ? "Video" : "Gambar", attachment_url: url, attachment_type: type, attachment_size_bytes: sizeBytes || null, visibility: "main" });
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
    const { data: qrisMessage, error: qrisErrorResult } = isActiveRekber
      ? await supabase.rpc("send_rekber_qris", { p_group_id: rekberGroup.id, p_qris_url: qrisUrl })
      : await supabase.rpc("send_direct_purchase_qris", { p_request_id: request.id, p_qris_url: qrisUrl });
    if (qrisErrorResult) {
      setQrisBusy(false);
      setBusyAction(false);
      setChatError(qrisErrorResult.message || "QRIS gagal diberikan.");
      return false;
    }
    setQrisBusy(false);
    setBusyAction(false);
    const sentAt = qrisMessage?.created_at || new Date().toISOString();
    if (isActiveRekber) setRekberGroup((prev) => ({ ...prev, qris_to_third_party_sent_at: sentAt }));
    else setRequest((prev) => ({ ...prev, qris_sent_at: sentAt }));
    setQrisUploadOpen(false);
    resetQrisUpload();
    return true;
  }

  async function handleGiveQris() {
    if (!request || !isSeller) return;
    setQrisUploadMode("seller");
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

  async function handleMidmanQris() {
    if (!isRekberThirdParty || !rekberGroup?.id) return;
    setQrisUploadMode("midman");
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
      const path = `${user.id}/midman-qris-${Date.now()}-${crypto.randomUUID?.() || Math.random().toString(36).slice(2)}.jpg`;
      const { error: uploadError } = await supabase.storage.from("chat-attachments").upload(path, uploadFile, { contentType: "image/jpeg", upsert: false });
      if (uploadError) {
        setQrisError("QRIS Midman gagal diunggah.");
        return;
      }
      const { data: publicData } = supabase.storage.from("chat-attachments").getPublicUrl(path);
      const { data: group, error: qrisErrorResult } = await supabase.rpc("set_rekber_midman_qris", { p_group_id: rekberGroup.id, p_qris_url: publicData.publicUrl });
      if (qrisErrorResult) {
        setQrisError(qrisErrorResult.message || "QRIS Midman gagal disimpan.");
        return;
      }
      setRekberGroup(group);
      setQrisUploadOpen(false);
      resetQrisUpload();
    } catch {
      setQrisError("QRIS Midman tidak dapat diproses. Pilih gambar yang valid.");
    } finally {
      setQrisBusy(false);
    }
  }

  async function activateSharedAccount() {
    if (!isRekberThirdParty || !rekberGroup?.id) return;
    if (!rekberGroup.midman_qris_url) {
      setQrisUploadMode("midman");
      setQrisUploadOpen(true);
      return;
    }
    setBusyAction(true);
    setChatError("");
    const { data, error } = await supabase.rpc("activate_rekber_account", { p_group_id: rekberGroup.id, p_qris_url: rekberGroup.midman_qris_url });
    setBusyAction(false);
    if (error) return setChatError(error.message || "Rekening bersama gagal diaktifkan.");
    setRekberGroup(data);
  }

  async function requestRekberCustody() {
    if (!isRekberThirdParty || !rekberGroup?.id || !rekberGroup.activated_at) return;
    setBusyAction(true);
    setChatError("");
    const { data, error } = await supabase.rpc("request_rekber_custody", { p_group_id: rekberGroup.id });
    setBusyAction(false);
    if (error) return setChatError(error.message || "Pengamanan dana/item belum dapat diminta.");
    setRekberGroup(data);
  }

  async function markRekberDone() {
    if ((!isBuyer && !isSeller) || !rekberGroup?.id || !isActiveRekber || !rekberGroup.custody_requested_at || !rekberGroup.qris_to_third_party_sent_at) return;
    setBusyAction(true);
    setChatError("");
    const { data, error } = await supabase.rpc("mark_rekber_party_done", { p_group_id: rekberGroup.id });
    setBusyAction(false);
    if (error) return setChatError(error.message || "Konfirmasi penyelesaian gagal disimpan.");
    setRekberGroup(data);
  }

  async function requestRekberRating() {
    if (!isRekberThirdParty || !rekberGroup?.id || !rekberGroup.custody_requested_at || !rekberGroup.buyer_done_at || !rekberGroup.seller_done_at) return;
    setBusyAction(true);
    setChatError("");
    const { data, error } = await supabase.rpc("request_rekber_rating", { p_group_id: rekberGroup.id });
    setBusyAction(false);
    if (error) return setChatError(error.message || "Permintaan rating gagal dikirim.");
    setRekberGroup(data);
  }

  function openRekberCustodyFlow() {
    setRekberItemQuantity(String(Math.max(1, Number(request?.item_quantity || 1))));
    setRekberFinalPrice(request?.final_price ? String(request.final_price) : "");
    setRekberPricePromptOpen(true);
  }

  async function completeRekberCustody() {
    if (!isRekberThirdParty || !rekberGroup?.id) return;
    if (!rekberGroup.midman_rating_requested_at || rekberReviewCount < 2) {
      setChatError("Minta rating Seller dan Buyer, lalu tunggu keduanya mengirim rating.");
      return;
    }
    const parsedPrice = Number(rekberFinalPrice);
    const parsedQuantity = Number(rekberItemQuantity);
    if (!Number.isInteger(parsedQuantity) || parsedQuantity < 1) return setChatError("Jumlah barang harus berupa bilangan bulat minimal 1.");
    if (!parsedPrice || parsedPrice <= 0) return setChatError("Midman (MM) harus mengisi harga total barang.");
    setBusyAction(true);
    setChatError("");
    const { data, error } = await supabase.rpc("complete_rekber_custody", { p_group_id: rekberGroup.id, p_final_price: parsedPrice, p_item_quantity: parsedQuantity });
    setBusyAction(false);
    if (error) return setChatError(error.message || "Pengamanan transaksi belum dapat diselesaikan.");
    setRekberGroup(data);
    setRequest((prev) => ({ ...prev, status: "completed", final_price: parsedPrice, item_quantity: parsedQuantity, completed_at: new Date().toISOString() }));
    setRekberPricePromptOpen(false);
  }

  async function submitRekberRating() {
    if (!rekberGroup?.midman_rating_requested_at) return setChatError("Midman (MM) belum meminta rating.");
    if (!rekberThirdPartyRating || !rekberGroup?.id) return setChatError("Pilih rating Midman (MM) terlebih dahulu.");
    if (isBuyer && !rekberProductRating) return setChatError("Pilih rating produk terlebih dahulu.");
    setBusyAction(true);
    setChatError("");
    const rpcName = isBuyer ? "submit_rekber_buyer_rating" : "submit_rekber_seller_rating";
    const args = isBuyer
      ? { p_group_id: rekberGroup.id, p_product_rating: rekberProductRating, p_third_party_rating: rekberThirdPartyRating, p_comment: rekberRatingComment.trim() || null }
      : { p_group_id: rekberGroup.id, p_third_party_rating: rekberThirdPartyRating, p_comment: rekberRatingComment.trim() || null };
    const { error } = await supabase.rpc(rpcName, args);
    setBusyAction(false);
    if (error) return setChatError(error.message || "Rating Rekber gagal disimpan.");
    setRekberRatingOpen(false);
    setRekberRatingSubmitted(true);
    setRekberProductRating(0);
    setRekberThirdPartyRating(0);
    setRekberRatingComment("");
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
    const parsedQuantity = Number(itemQuantity);
    if (!Number.isInteger(parsedQuantity) || parsedQuantity < 1) return setChatError("Jumlah barang harus berupa bilangan bulat minimal 1.");
    if (!parsedPrice || parsedPrice <= 0) return setChatError("Masukkan harga total item yang valid.");
    setBusyAction(true);
    setChatError("");
    const { data: moderationNoticeResult, error } = await supabase.rpc("complete_direct_purchase", { p_request_id: request.id, p_final_price: parsedPrice, p_item_quantity: parsedQuantity });
    setBusyAction(false);
    if (error) return setChatError(error.message || "Transaksi belum dapat diselesaikan.");
    if (moderationNoticeResult) setModerationNotice(moderationNoticeResult);
    setRequest((prev) => ({ ...prev, status: "completed", final_price: parsedPrice, item_quantity: parsedQuantity, completed_at: new Date().toISOString(), seller_done_at: new Date().toISOString() }));
    setPricePromptOpen(false);
  }

  function renderMessageList(list, title, profile, panelClass = "", options = {}) {
    const { target, collapsed = false, setCollapsed, textValue = "", setTextValue } = options;
    const toggle = () => setCollapsed?.((value) => !value);
    return <section className={`whisper-panel ${panelClass} ${collapsed ? "whisper-panel-collapsed" : ""}`} aria-label={`Chat ${title}`}>
      <header className="whisper-panel-header">
        <button type="button" className="whisper-panel-avatar whisper-panel-toggle" onClick={toggle} aria-label={`${collapsed ? "Buka" : "Perkecil"} chat ${title}`} aria-expanded={!collapsed}>{profile?.avatar_url ? <img src={profile.avatar_url} alt="" /> : <span>{profile?.display_name?.[0] || "U"}</span>}</button>
        <div className="whisper-panel-heading"><strong>{title}</strong><small>{profile?.display_name || "Midman (MM)"}</small></div>
        <button type="button" className="whisper-panel-collapse-button" onClick={toggle} aria-label={`${collapsed ? "Buka" : "Perkecil"} panel ${title}`}>{collapsed ? "＋" : "−"}</button>
      </header>
      {!collapsed && <>
        <div className="whisper-panel-messages">
          {list.length ? list.map((message) => {
            const messageProfile = message.sender_id === user.id ? currentProfile : (message.sender_id === rekberGroup?.third_party_id ? rekberThirdPartyProfile : profile);
            return <div key={message.id} className={`chat-message-row ${message.sender_id === user.id ? "is-mine" : "is-theirs"}`}>
              {message.sender_id !== user.id && <span className="chat-message-avatar chat-message-avatar-left" aria-hidden="true">{messageProfile?.avatar_url ? <img src={messageProfile.avatar_url} alt="" /> : <span>{messageProfile?.display_name?.[0] || "U"}</span>}</span>}
              <div className={`chat-bubble ${message.attachment_type === "qris" ? "chat-qris-bubble" : ""}`}>
                {message.attachment_type === "qris" && message.attachment_url ? <div className="chat-qris-card"><strong>QRIS pembayaran</strong><button type="button" className="chat-image-button chat-qris-image-button" onClick={() => openLightbox(message.attachment_url)} aria-label="Buka QRIS dan zoom"><img src={message.attachment_url} alt="QRIS pembayaran, ketuk untuk memperbesar" className="chat-attachment-media" /></button><small>Dikirim melalui whispering Storichi</small></div> : message.attachment_url ? (message.attachment_type === "video" ? <video src={message.attachment_url} controls className="chat-attachment-media" /> : <button type="button" className="chat-image-button" onClick={() => openLightbox(message.attachment_url)} aria-label="Buka gambar pesan dan zoom"><img src={message.attachment_url} alt="Lampiran gambar pesan" className="chat-attachment-media" /></button>) : <span>{message.content}</span>}
                <time dateTime={message.created_at}>{formatMessageTime(message.created_at)}</time>
              </div>
              {message.sender_id === user.id && <span className="chat-message-avatar chat-message-avatar-right" aria-hidden="true">{messageProfile?.avatar_url ? <img src={messageProfile.avatar_url} alt="" /> : <span>{messageProfile?.display_name?.[0] || "U"}</span>}</span>}
            </div>;
          }) : <p className="whisper-empty">Belum ada pesan whispering.</p>}
        </div>
        <form className="whisper-panel-composer" onSubmit={(event) => { event.preventDefault(); sendWhisperText(target, textValue, setTextValue); }}>
          <AttachmentButton userId={user.id} onUploaded={(attachment) => sendWhisperAttachment(target, attachment)} disabled={chatCompleted} />
          <input value={textValue} onChange={(event) => setTextValue?.(event.target.value)} placeholder={`Pesan untuk ${title}`} maxLength={2000} disabled={chatCompleted} aria-label={`Pesan whisper untuk ${title}`} />
          <button type="submit" className="whisper-panel-send" disabled={chatCompleted || !textValue.trim()} aria-label={`Kirim pesan ke ${title}`}>Kirim</button>
        </form>
      </>}
    </section>;
  }

  if (!user) return <main className="container empty-state"><h2>Masuk untuk membuka chat</h2></main>;
  if (loading) return <main className="chat-thread-page"><div className="skeleton" style={{ height: "70vh" }} /></main>;
  if (!thread) return <main className="container empty-state"><p>Percakapan tidak ditemukan.</p></main>;

  return (
    <main className={`chat-thread-page ${isActiveRekber ? "is-rekber-active-chat" : ""}`}>
      {chatCompleted && <div className={`chat-completed-overlay ${completedHistoryRevealed ? "is-revealed" : ""}`} aria-label="Transaksi selesai dan terkunci">
        {!completedHistoryRevealed ? <>
          <div className="chat-completed-mark" aria-hidden="true">✓</div>
          <strong>Transaksi selesai</strong>
          <span>Riwayat chat dan gambar masih dapat dibaca, tetapi proses tidak dapat diubah.</span>
          <div className="completed-history-slider" aria-label="Geser untuk membuka riwayat chat">
            <span>Geser untuk lihat riwayat</span>
            <button type="button" className="completed-history-slider-thumb" style={{ transform: `translateX(${historySwipeOffset}px)` }} onPointerDown={handleHistorySwipeStart} onPointerMove={handleHistorySwipeMove} onPointerUp={handleHistorySwipeEnd} onPointerCancel={handleHistorySwipeEnd} onContextMenu={(event) => event.preventDefault()} aria-label="Geser ke kanan untuk melihat riwayat">→</button>
          </div>
        </> : <div className="completed-history-revealed-bar"><span className="chat-completed-mini-mark" aria-hidden="true">✓</span><strong>Transaksi selesai</strong><span>Riwayat dapat dibaca</span></div>}
      </div>}

      {isActiveRekber && <div className="rekber-chat-active-strip" role="status"><span className="rekber-mm-strip-profile"><span className="rekber-mm-strip-avatar">{rekberThirdPartyProfile?.avatar_url ? <img src={rekberThirdPartyProfile.avatar_url} alt="" /> : <span>{rekberThirdPartyProfile?.display_name?.[0] || "M"}</span>}</span><span><strong>{rekberGroup.activated_at ? "Rekber aktif" : "Midman (MM) terhubung"}</strong><small>{rekberThirdPartyProfile?.display_name || "Midman (MM)"}</small></span></span><span>{rekberGroup.activated_at ? "Whispering aktif." : "Chat normal tiga pihak. Menunggu Midman (MM) mengaktifkan rekening bersama."}</span></div>}

      <header className="chat-conversation-header">
        <Link to="/chat" className="chat-back-button" aria-label="Kembali ke daftar chat">←</Link>
        <Link to={`/toko/${participant?.id || ""}`} className="chat-conversation-avatar" aria-label={`Buka toko ${participant?.display_name || "pengguna"}`} title="Buka toko pengguna">{participant?.avatar_url ? <img src={participant.avatar_url} alt="" /> : <span>{participant?.display_name?.[0] || "U"}</span>}</Link>
        <div className="chat-conversation-info"><strong>{participant?.display_name || "Pengguna"}</strong><span>{thread.product?.name || "Percakapan umum"}</span></div>
        <span className="chat-online-dot" title="Percakapan aman" />
      </header>

      {request && <div className={`chat-request-wrap ${productCollapsed ? "is-collapsed" : ""} ${isActiveRekber ? "is-rekber-active" : ""}`}>
        <button type="button" className="chat-product-collapse" onClick={() => setProductCollapsed((value) => !value)} aria-expanded={!productCollapsed}>
          <span>{productCollapsed ? "Produk yang dibeli" : "Perkecil kartu produk"}</span><span aria-hidden="true">{productCollapsed ? "⌄" : "⌃"}</span>
        </button>
        {!productCollapsed && <><div className="rekber-chat-product-flag">{rekberGroup?.activated_at ? "REKBER AKTIF" : ""}</div><PurchaseRequestCard request={{ ...request, product: request.product || thread.product }} isSeller={isSeller} currentUserId={user.id} onUpdate={setRequest} /></>}
        {productCollapsed && <Link to={`/produk/${request.product?.slug || thread.product?.slug || ""}`} className="chat-product-collapsed-title">{request.product?.name || thread.product?.name || "Produk"}</Link>}
      </div>}

      <div className="chat-messages" aria-live="polite">
        <div className="chat-day-label">{isRekberCompleted ? "Riwayat Midman (MM)" : hasJoinedThreePartyChat ? "Percakapan tiga pihak" : "Percakapan transaksi"}</div>
        {displayedMainChatMessages.map((message) => {
          const isMidmanMessage = !isRekberThirdParty && message.sender_id === rekberGroup?.third_party_id;
          const messageProfile = message.sender_id === user.id ? currentProfile : (message.sender_id === rekberGroup?.third_party_id ? rekberThirdPartyProfile : participant);
          return <div key={message.id} className={`chat-message-row ${message.sender_id === user.id ? "is-mine" : "is-theirs"} ${isMidmanMessage ? "is-rekber-third-party" : ""} ${message.attachment_type === "qris" ? "is-qris" : ""} ${message.attachment_type === "system" ? "is-system" : ""}`}>
            {isMidmanMessage && <span className="chat-message-avatar chat-message-avatar-top" aria-hidden="true">{messageProfile?.avatar_url ? <img src={messageProfile.avatar_url} alt="" /> : <span>{messageProfile?.display_name?.[0] || "M"}</span>}</span>}
            {!isMidmanMessage && message.sender_id !== user.id && <span className="chat-message-avatar chat-message-avatar-left" aria-hidden="true">{messageProfile?.avatar_url ? <img src={messageProfile.avatar_url} alt="" /> : <span>{messageProfile?.display_name?.[0] || "U"}</span>}</span>}
            <div className={`chat-bubble ${message.attachment_type === "qris" ? "chat-qris-bubble" : ""} ${message.attachment_type === "system" ? "chat-system-bubble" : ""}`}>
              {message.attachment_type === "qris" && message.attachment_url ? <div className="chat-qris-card"><strong>QRIS dari {message.sender_id === user.id ? (currentProfile?.display_name || "Seller") : (participant?.display_name || "Seller")}</strong><button type="button" className="chat-image-button chat-qris-image-button" onClick={() => openLightbox(message.attachment_url)} aria-label="Buka QRIS dan zoom"><img src={message.attachment_url} alt="QRIS pembayaran, ketuk untuk memperbesar" className="chat-attachment-media" /></button><small>Scan QRIS ini untuk melanjutkan pembayaran</small></div> : message.attachment_url ? (message.attachment_type === "video" ? <video src={message.attachment_url} controls className="chat-attachment-media" /> : <button type="button" className="chat-image-button" onClick={() => openLightbox(message.attachment_url)} aria-label="Buka gambar pesan dan zoom"><img src={message.attachment_url} alt="Lampiran gambar pesan" className="chat-attachment-media" /></button>) : <span>{message.content}</span>}
              <time dateTime={message.created_at}>{formatMessageTime(message.created_at)}{message.sender_id === user.id && <span className={`chat-message-read-state ${message.read_at ? "is-read" : ""}`} title={message.read_at ? "Telah terbaca" : "Terkirim"}>{message.read_at ? " ✓✓" : " ✓"}</span>}</time>
            </div>
            {!isMidmanMessage && message.sender_id === user.id && <span className="chat-message-avatar chat-message-avatar-right" aria-hidden="true">{messageProfile?.avatar_url ? <img src={messageProfile.avatar_url} alt="" /> : <span>{messageProfile?.display_name?.[0] || "U"}</span>}</span>}
          </div>;
        })}
      </div>

      {moderationNotice && <div className="chat-moderation-warning" role="alert">{moderationNotice}</div>}
      {chatError && <div className="chat-moderation-notice" role="alert">{chatError}</div>}
      <div className={`chat-composer-shell ${chatLocked ? "is-locked" : ""}`}>
        <form className="chat-input-bar" onSubmit={sendMessage}>
          <AttachmentButton userId={user.id} onUploaded={sendAttachment} disabled={chatLocked} />
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder={chatLocked ? "Beri rating sebelum chat..." : "Tulis pesan..."} aria-label="Tulis pesan" disabled={chatLocked} />
          <button type="submit" className="chat-send-button" disabled={chatLocked || !text.trim()} aria-label="Kirim pesan">↑</button>
        </form>
      </div>

      {isWhispering && <section className={`whisper-overlay ${isRekberThirdParty ? "whisper-overlay-third-party" : "whisper-overlay-party"}`} aria-label="Layer whisper Rekber" aria-live="polite">
        <div className="whisper-overlay-label"><strong>Layer whisper Rekber</strong><span>Chat utama tetap tersimpan di bawah.</span></div>
        {isRekberThirdParty ? <div className="whisper-overlay-panels">
          {renderMessageList(sellerWhisperMessages, "Seller", participant, "whisper-panel-seller", { target: "seller", collapsed: whisperMinimized.seller, setCollapsed: (value) => setWhisperMinimized((state) => ({ ...state, seller: typeof value === "function" ? value(state.seller) : value })), textValue: whisperTextSeller, setTextValue: setWhisperTextSeller })}
          {renderMessageList(buyerWhisperMessages, "Buyer", rekberBuyerProfile, "whisper-panel-buyer", { target: "buyer", collapsed: whisperMinimized.buyer, setCollapsed: (value) => setWhisperMinimized((state) => ({ ...state, buyer: typeof value === "function" ? value(state.buyer) : value })), textValue: whisperTextBuyer, setTextValue: setWhisperTextBuyer })}
        </div> : renderMessageList(isBuyer ? buyerWhisperMessages : sellerWhisperMessages, "Midman (MM)", rekberThirdPartyProfile, "whisper-panel-single", { target: isBuyer ? "buyer" : "seller", collapsed: whisperMinimized.single, setCollapsed: (value) => setWhisperMinimized((state) => ({ ...state, single: typeof value === "function" ? value(state.single) : value })), textValue: whisperTextSingle, setTextValue: setWhisperTextSingle })}
      </section>}

      <div ref={bottomRef} />

      {isActiveRekber && <section className="rekber-chat-control-card" aria-label="Kontrol Rekber di chat">
        <div className="rekber-chat-control-heading"><strong>Rekening Bersama</strong><span>{rekberGroup.activated_at ? "Aktif" : "Menunggu aktivasi Midman (MM)"}</span></div>
        {isRekberThirdParty && !rekberGroup.activated_at && <><p className="rekber-chat-control-note">Upload QRIS Midman (MM) terlebih dahulu. Saat rekening bersama diaktifkan, QRIS ini otomatis dikirim ke Buyer.</p>{!rekberGroup.midman_qris_url && <button type="button" className="chat-qris-trigger" disabled={qrisBusy} onClick={handleMidmanQris}>▣ <span>Upload QRIS Midman (MM)</span></button>}<button type="button" className="btn btn-primary btn-full" disabled={busyAction || !rekberGroup.midman_qris_url} onClick={activateSharedAccount}>{busyAction ? "Mengaktifkan..." : "Aktifkan Rekening Bersama"}</button></>}
        {isRekberThirdParty && rekberGroup.activated_at && <p className="rekber-chat-control-note">Whispering aktif dengan Midman (MM). QRIS Midman sudah dikirim otomatis ke Buyer.</p>}
        {!isRekberThirdParty && rekberGroup.activated_at && rekberGroup.custody_requested_at && rekberGroup.qris_to_third_party_sent_at && ((isBuyer && !rekberGroup.buyer_done_at) || (isSeller && !rekberGroup.seller_done_at)) && <button type="button" className="btn btn-outline btn-full" disabled={busyAction} onClick={markRekberDone}>{busyAction ? "Menyimpan..." : "Saya setuju menyelesaikan transaksi"}</button>}
        {isRekberThirdParty && rekberGroup.activated_at && !rekberGroup.custody_requested_at && <button type="button" className="btn btn-primary btn-full" disabled={busyAction} onClick={requestRekberCustody}>{busyAction ? "Mengirim QRIS Seller..." : "Pengamanan dana/item selesai"}</button>}
        {isRekberThirdParty && rekberGroup.custody_requested_at && <p className="rekber-chat-control-note">QRIS Seller sudah diminta dan dikirim ke Midman (MM). Menunggu persetujuan Seller dan Buyer.</p>}
        {isRekberThirdParty && rekberGroup.custody_requested_at && rekberGroup.buyer_done_at && rekberGroup.seller_done_at && !rekberGroup.midman_rating_requested_at && <button type="button" className="btn btn-outline btn-full" disabled={busyAction} onClick={requestRekberRating}>{busyAction ? "Mengirim permintaan..." : "Minta rating dari Seller & Buyer"}</button>}
        {isRekberThirdParty && rekberGroup.midman_rating_requested_at && <p className="rekber-chat-control-note">Rating diterima: {rekberReviewCount}/2. Custody terbuka setelah Seller dan Buyer mengirim rating.</p>}
        {isRekberThirdParty && rekberGroup.custody_requested_at && rekberGroup.buyer_done_at && rekberGroup.seller_done_at && rekberGroup.midman_rating_requested_at && <button type="button" className="btn btn-primary btn-full" disabled={busyAction || rekberReviewCount < 2} onClick={openRekberCustodyFlow}>{busyAction ? "Mengamankan..." : rekberReviewCount < 2 ? "Menunggu rating Seller & Buyer" : "Selesaikan custody"}</button>}
        <div className="rekber-chat-status-line"><span>Seller: {rekberGroup.seller_done_at ? "siap" : "belum"}</span><span>Buyer: {rekberGroup.buyer_done_at ? "siap" : "belum"}</span><span>QRIS Seller: {rekberGroup.qris_to_third_party_sent_at ? "terkirim" : "belum"}</span><span>Rating MM: {rekberReviewCount}/2</span></div>
      </section>}

      {isActiveRekber && (isBuyer || isSeller) && !rekberRatingSubmitted && !rekberRatingOpen && rekberGroup?.midman_rating_requested_at && <button type="button" className="chat-rating-trigger" onClick={() => setRekberRatingOpen(true)}>☆ <span>{isBuyer ? "Beri rating produk & Midman (MM)" : "Beri rating Midman (MM)"}</span></button>}
      {rekberRatingOpen && <section className="direct-rating-popup rekber-rating-popup" aria-label="Beri rating Rekber">
        <div className="direct-rating-popup-head"><strong>{isBuyer ? "Nilai produk dan Midman (MM)" : "Nilai Midman (MM)"}</strong><span>Rating hanya dapat dikirim satu kali.</span></div>
        {isBuyer && <><small>Rating produk</small><div className="direct-rating-stars">{[1, 2, 3, 4, 5].map((value) => <button type="button" key={`product-${value}`} className={value <= rekberProductRating ? "is-selected" : ""} onClick={() => setRekberProductRating(value)} aria-label={`${value} bintang produk`}>★</button>)}</div></>}
        <small>Rating Midman (MM)</small><div className="direct-rating-stars">{[1, 2, 3, 4, 5].map((value) => <button type="button" key={`third-party-${value}`} className={value <= rekberThirdPartyRating ? "is-selected" : ""} onClick={() => setRekberThirdPartyRating(value)} aria-label={`${value} bintang Midman (MM)`}>★</button>)}</div>
        <input value={rekberRatingComment} onChange={(e) => setRekberRatingComment(e.target.value)} placeholder="Komentar singkat (opsional)" />
        <button type="button" className="btn btn-primary btn-full" disabled={busyAction || !rekberThirdPartyRating || (isBuyer && !rekberProductRating)} onClick={submitRekberRating}>{busyAction ? "Menyimpan..." : "Kirim rating"}</button>
      </section>}

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

      {sellerCanSendQris && <button type="button" className="chat-qris-trigger" disabled={busyAction || qrisBusy} onClick={handleGiveQris} title="Berikan QRIS kepada Buyer">▣ <span>{currentProfile?.qris_url ? "Berikan QRIS" : "Siapkan & berikan QRIS"}</span></button>}
      {sellerCanRequestRating && <button type="button" className="chat-rating-trigger" disabled={busyAction} onClick={requestRating} title="Minta rating Buyer">☆ <span>Minta rating</span></button>}
      {waitingForBuyerRating && !ratingOpen && <button type="button" className="chat-rating-trigger" onClick={() => setRatingOpen(true)}>☆ <span>Beri rating produk</span></button>}
      {sellerCanComplete && <button type="button" className="chat-done-trigger" disabled={busyAction} onClick={openDoneFlow}>DONE</button>}

      {qrisUploadOpen && (
        <div className="direct-action-modal" role="dialog" aria-modal="true" aria-label="Siapkan QRIS toko">
          <div className="direct-action-modal-card qris-upload-modal">
            <h3>{qrisUploadMode === "midman" ? "Upload QRIS Midman (MM)" : "Siapkan QRIS Seller"}</h3>
            <p>{qrisUploadMode === "midman" ? "QRIS Midman disimpan untuk dikirim otomatis kepada Buyer saat Rekening Bersama diaktifkan." : "Upload QRIS satu kali. Setelah ditetapkan, QRIS ini tersimpan sebagai QR toko."}</p>
            <label className="qris-file-picker">{qrisPreviewUrl ? <img src={qrisPreviewUrl} alt="Pratinjau QRIS" /> : <span>Ketuk untuk memilih gambar QRIS</span>}<input type="file" accept="image/*" onChange={chooseQrisFile} /></label>
            {qrisError && <p className="form-error" role="alert">{qrisError}</p>}
            <div className="direct-action-modal-actions"><button type="button" className="btn btn-outline" onClick={() => { setQrisUploadOpen(false); resetQrisUpload(); }}>Batal</button><button type="button" className="btn btn-primary" disabled={!qrisFile || qrisBusy} onClick={qrisUploadMode === "midman" ? handleMidmanQris : handleGiveQris}>{qrisBusy ? "Menyiapkan..." : qrisUploadMode === "midman" ? "Simpan QRIS Midman" : "Tetapkan QR toko"}</button></div>
          </div>
        </div>
      )}

      {doneConfirmOpen && (
        <div className="direct-action-modal" role="dialog" aria-modal="true">
          <div className="direct-action-modal-card"><h3>Selesaikan transaksi?</h3><p>Pastikan item sudah diterima dan Buyer sudah memberikan rating. Setelah DONE, transaksi akan masuk ke riwayat.</p><label><input type="checkbox" checked={skipDoneConfirm} onChange={(e) => setSkipDoneConfirm(e.target.checked)} /> Jangan tampilkan lagi</label><div className="direct-action-modal-actions"><button type="button" className="btn btn-outline" onClick={() => setDoneConfirmOpen(false)}>Batal</button><button type="button" className="btn btn-primary" onClick={continueDoneFlow}>Lanjut</button></div></div>
        </div>
      )}
      {rekberPricePromptOpen && (
        <div className="direct-action-modal" role="dialog" aria-modal="true">
          <div className="direct-action-modal-card">
            <h3>Data transaksi Rekber</h3>
            <p>Midman (MM) wajib mengisi jumlah barang dan harga total sebelum custody diselesaikan.</p>
            <label className="done-price-field">Jumlah barang<input type="number" min="1" step="1" inputMode="numeric" value={rekberItemQuantity} onChange={(e) => setRekberItemQuantity(e.target.value)} placeholder="Contoh: 2" /></label>
            <label className="done-price-field">Harga total<input type="number" min="1" inputMode="numeric" value={rekberFinalPrice} onChange={(e) => setRekberFinalPrice(e.target.value)} placeholder="Contoh: 100000" /></label>
            {Number(rekberItemQuantity) > 0 && Number(rekberFinalPrice) > 0 && <div className="done-price-ratio"><strong>Harga : jumlah</strong><span>{Number(rekberFinalPrice).toLocaleString("id-ID")} : {Number(rekberItemQuantity).toLocaleString("id-ID")} = {(Number(rekberFinalPrice) / Number(rekberItemQuantity)).toLocaleString("id-ID", { maximumFractionDigits: 2 })} per barang</span></div>}
            <div className="direct-action-modal-actions"><button type="button" className="btn btn-outline" onClick={() => setRekberPricePromptOpen(false)}>Batal</button><button type="button" className="btn btn-primary" disabled={busyAction} onClick={completeRekberCustody}>{busyAction ? "Mengamankan..." : "Selesaikan custody"}</button></div>
          </div>
        </div>
      )}
      {pricePromptOpen && (
        <div className="direct-action-modal" role="dialog" aria-modal="true">
          <div className="direct-action-modal-card">
            <h3>Harga dan jumlah barang</h3>
            <p>Masukkan jumlah barang dan harga total yang akan dicatat untuk Buyer serta Seller.</p>
            <label className="done-price-field">Jumlah barang<input type="number" min="1" step="1" inputMode="numeric" value={itemQuantity} onChange={(e) => setItemQuantity(e.target.value)} placeholder="Contoh: 2" /></label>
            <label className="done-price-field">Harga total<input type="number" min="1" inputMode="numeric" value={finalPrice} onChange={(e) => setFinalPrice(e.target.value)} placeholder="Contoh: 100000" /></label>
            {Number(itemQuantity) > 0 && Number(finalPrice) > 0 && <div className="done-price-ratio"><strong>Harga : jumlah</strong><span>{Number(finalPrice).toLocaleString("id-ID")} : {Number(itemQuantity).toLocaleString("id-ID")} = {(Number(finalPrice) / Number(itemQuantity)).toLocaleString("id-ID", { maximumFractionDigits: 2 })} per barang</span><small>Rasio dasar 1:1 — harga per barang dihitung dari harga total dibagi jumlah barang.</small></div>}
            <div className="direct-action-modal-actions"><button type="button" className="btn btn-outline" onClick={() => setPricePromptOpen(false)}>Batal</button><button type="button" className="btn btn-primary" disabled={busyAction} onClick={completePurchase}>{busyAction ? "Menyimpan..." : "Selesaikan"}</button></div>
          </div>
        </div>
      )}

    </main>
  );
}
