import { Link } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import { enableChatPush, isPushSupported } from "../lib/pushNotifications";

const HOLD_DELAY = 420;
const SWIPE_THRESHOLD = 92;

function formatChatTime(value) {
  if (!value) return "";
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
}

export default function ChatList() {
  const { user } = useAuth();
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pushMessage, setPushMessage] = useState("");
  const [pushBusy, setPushBusy] = useState(false);
  const [swipeOffsets, setSwipeOffsets] = useState({});
  const [undoNotice, setUndoNotice] = useState(null);
  const gestureRef = useRef(null);
  const undoTimerRef = useRef(null);
  const suppressClickRef = useRef(false);

  useEffect(() => {
    if (!user) return undefined;
    let active = true;

    async function load() {
      const { data: rawThreads } = await supabase
        .from("chat_threads")
        .select("*, product:products(name, image_url)")
        .or(`user_a.eq.${user.id},user_b.eq.${user.id}`)
        .order("created_at", { ascending: false });
      const list = rawThreads || [];
      const ids = list.map((thread) => thread.id);
      if (!ids.length) {
        if (active) { setThreads([]); setLoading(false); }
        return;
      }

      const [{ data: profiles }, { data: messages }, { data: notifications }, { data: requests }] = await Promise.all([
        supabase.from("profiles").select("id, display_name, avatar_url, is_verified, is_owner").in("id", [...new Set(list.flatMap((thread) => [thread.user_a, thread.user_b]))]),
        supabase.from("chat_messages").select("id, thread_id, content, sender_id, created_at, attachment_type").in("thread_id", ids).order("created_at", { ascending: false }),
        supabase.from("chat_notifications").select("id, thread_id").eq("recipient_id", user.id).is("read_at", null).in("thread_id", ids),
        supabase.from("purchase_requests").select("id, thread_id, status, created_at").in("thread_id", ids).order("created_at", { ascending: false }),
      ]);
      const profileMap = new Map((profiles || []).map((profile) => [profile.id, profile]));
      const latestMap = new Map();
      (messages || []).forEach((message) => { if (!latestMap.has(message.thread_id)) latestMap.set(message.thread_id, message); });
      const unreadMap = new Map();
      (notifications || []).forEach((notification) => unreadMap.set(notification.thread_id, (unreadMap.get(notification.thread_id) || 0) + 1));
      const requestMap = new Map();
      (requests || []).forEach((request) => { if (!requestMap.has(request.thread_id)) requestMap.set(request.thread_id, request); });
      const next = list.map((thread) => {
        const participantId = thread.user_a === user.id ? thread.user_b : thread.user_a;
        const latest = latestMap.get(thread.id);
        const purchaseRequest = requestMap.get(thread.id);
        const isUserA = thread.user_a === user.id;
        return {
          ...thread,
          participant: profileMap.get(participantId),
          latest,
          purchaseRequest,
          completed: purchaseRequest?.status === "completed",
          unreadCount: unreadMap.get(thread.id) || 0,
          hiddenByUser: isUserA ? Boolean(thread.archived_by_user_a || thread.deleted_by_user_a) : Boolean(thread.archived_by_user_b || thread.deleted_by_user_b),
        };
      }).filter((thread) => !thread.hiddenByUser).sort((a, b) => new Date(b.latest?.created_at || b.created_at) - new Date(a.latest?.created_at || a.created_at));
      if (active) { setThreads(next); setLoading(false); }
    }

    load();
    const channel = supabase.channel(`chat_inbox_${user.id}`).on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, load).subscribe();
    return () => {
      active = false;
      supabase.removeChannel(channel);
      if (gestureRef.current?.timer) clearTimeout(gestureRef.current.timer);
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    };
  }, [user]);

  if (!user) return <main className="container empty-state"><h2>Masuk untuk melihat chat</h2><p>Login dengan Google untuk mulai chat dengan penjual atau pembeli.</p></main>;

  async function enablePush() {
    setPushBusy(true);
    const result = await enableChatPush(user.id);
    setPushMessage(result.message);
    setPushBusy(false);
  }

  function clearGesture() {
    if (gestureRef.current?.timer) clearTimeout(gestureRef.current.timer);
    gestureRef.current = null;
  }

  function handlePointerDown(event, threadId) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    clearGesture();
    const gesture = { threadId, startX: event.clientX, startY: event.clientY, held: false, moved: false, offset: 0, timer: null };
    gesture.timer = window.setTimeout(() => {
      if (gestureRef.current === gesture) {
        gesture.held = true;
        event.currentTarget.setPointerCapture?.(event.pointerId);
      }
    }, HOLD_DELAY);
    gestureRef.current = gesture;
  }

  function handlePointerMove(event, threadId) {
    const gesture = gestureRef.current;
    if (!gesture || gesture.threadId !== threadId) return;
    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;
    if (!gesture.held) {
      if (Math.hypot(dx, dy) > 10) clearGesture();
      return;
    }
    event.preventDefault();
    gesture.moved = true;
    gesture.offset = Math.max(-150, Math.min(150, dx));
    setSwipeOffsets((current) => ({ ...current, [threadId]: gesture.offset }));
  }

  async function performThreadAction(thread, action) {
    const { error } = await supabase.rpc("set_chat_thread_state", { p_thread_id: thread.id, p_action: action });
    if (error) {
      setPushMessage("Aksi chat belum tersedia. Jalankan schema_v23.sql terlebih dahulu.");
      setSwipeOffsets((current) => ({ ...current, [thread.id]: 0 }));
      return;
    }
    setThreads((current) => current.filter((item) => item.id !== thread.id));
    setSwipeOffsets((current) => { const next = { ...current }; delete next[thread.id]; return next; });
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoNotice({ thread, action });
    undoTimerRef.current = window.setTimeout(() => setUndoNotice(null), 6000);
  }

  function handlePointerUp(event, thread) {
    const gesture = gestureRef.current;
    if (!gesture || gesture.threadId !== thread.id) return;
    if (gesture.timer) clearTimeout(gesture.timer);
    if (gesture.held && Math.abs(gesture.offset) >= SWIPE_THRESHOLD) {
      suppressClickRef.current = true;
      performThreadAction(thread, gesture.offset < 0 ? "archive" : "delete");
    } else if (gesture.held && gesture.moved) {
      setSwipeOffsets((current) => ({ ...current, [thread.id]: 0 }));
      suppressClickRef.current = true;
    }
    clearGesture();
  }

  function handleRowClick(event) {
    if (suppressClickRef.current) {
      event.preventDefault();
      suppressClickRef.current = false;
    }
  }

  async function undoThreadAction() {
    if (!undoNotice) return;
    const { thread } = undoNotice;
    const { error } = await supabase.rpc("set_chat_thread_state", { p_thread_id: thread.id, p_action: "restore" });
    if (error) {
      setPushMessage("Chat tidak dapat dipulihkan.");
      return;
    }
    setThreads((current) => [...current, { ...thread, hiddenByUser: false }].sort((a, b) => new Date(b.latest?.created_at || b.created_at) - new Date(a.latest?.created_at || a.created_at)));
    setUndoNotice(null);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
  }

  return (
    <main className="container chat-inbox-page">
      <div className="chat-list-heading"><div><span className="section-kicker">Percakapan</span><h1 className="page-title">Chat</h1></div><span className="chat-list-status">Aman dan langsung</span></div>
      {isPushSupported() && <div className="push-notification-panel"><div><strong>Jangan lewatkan pesan masuk</strong><p>Aktifkan notifikasi agar pesan tetap terlihat saat Storichi ditutup.</p></div><button type="button" className="btn btn-outline" onClick={enablePush} disabled={pushBusy}>{pushBusy ? "Mengaktifkan..." : "Aktifkan notifikasi"}</button></div>}
      {pushMessage && <p className="thread-item-sub push-notification-message">{pushMessage}</p>}
      {loading ? <div className="skeleton" style={{ height: 260 }} /> : !threads.length ? (
        <div className="empty-state"><p>Belum ada percakapan. Mulai chat dari halaman produk.</p></div>
      ) : (
        <div className="chat-thread-list">
          {threads.map((thread) => {
            const offset = swipeOffsets[thread.id] || 0;
            return (
              <div className={`chat-thread-swipe-shell ${offset < 0 ? "show-archive" : offset > 0 ? "show-delete" : ""}`} key={thread.id}>
                <Link
                  to={`/chat/${thread.id}`}
                  className="chat-thread-row"
                  style={{ transform: `translate3d(${offset}px, 0, 0)` }}
                  onPointerDown={(event) => handlePointerDown(event, thread.id)}
                  onPointerMove={(event) => handlePointerMove(event, thread.id)}
                  onPointerUp={(event) => handlePointerUp(event, thread)}
                  onPointerCancel={clearGesture}
                  onClick={handleRowClick}
                  onContextMenu={(event) => event.preventDefault()}
                >
                  <div className="chat-thread-avatar">{thread.participant?.avatar_url ? <img src={thread.participant.avatar_url} alt="" /> : <span>{thread.participant?.display_name?.[0] || "U"}</span>}</div>
                  <div className="chat-thread-main">
                    <div className="chat-thread-title-row"><strong>{thread.participant?.display_name || "Pengguna"}</strong><time>{formatChatTime(thread.latest?.created_at || thread.created_at)}</time></div>
                    <div className="chat-thread-product">{thread.product?.name || "Percakapan umum"}</div>
                    <p>{thread.latest?.attachment_type === "image" ? "Gambar" : thread.latest?.attachment_type === "video" ? "Video" : thread.latest?.content || "Belum ada pesan"}</p>
                  </div>
                  {thread.unreadCount > 0 && <span className="chat-unread-badge">{thread.unreadCount > 99 ? "99+" : thread.unreadCount}</span>}
                  {thread.completed && <div className="chat-list-completed-overlay" aria-label="Transaksi selesai dan terkunci"><span className="chat-completed-mark" aria-hidden="true">✓</span><strong>Selesai</strong></div>}
                </Link>
              </div>
            );
          })}
        </div>
      )}
      <p className="chat-swipe-hint">Tahan sedikit lebih lama, lalu geser kiri untuk arsip atau kanan untuk hapus.</p>
      {undoNotice && <div className="chat-undo-bar" role="status"><span>{undoNotice.action === "archive" ? "Chat diarsipkan." : "Chat dihapus dari daftar."}</span><button type="button" onClick={undoThreadAction}>Undo</button></div>}
    </main>
  );
}
