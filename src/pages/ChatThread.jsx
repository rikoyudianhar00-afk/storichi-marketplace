import { Link, useParams } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import PurchaseRequestCard from "../components/PurchaseRequestCard";
import AttachmentButton from "../components/AttachmentButton";
import { markChatThreadRead } from "../lib/chatNotifications";
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
  const bottomRef = useRef(null);

  useEffect(() => {
    if (!user || !threadId) return undefined;
    let active = true;

    async function load() {
      const { data: threadData } = await supabase.from("chat_threads").select("*, product:products(name, image_url)").eq("id", threadId).maybeSingle();
      if (!threadData || (threadData.user_a !== user.id && threadData.user_b !== user.id)) {
        if (active) setLoading(false);
        return;
      }
      const participantId = threadData.user_a === user.id ? threadData.user_b : threadData.user_a;
      const [{ data: msgs }, { data: req }, { data: profile }] = await Promise.all([
        supabase.from("chat_messages").select("*").eq("thread_id", threadId).order("created_at", { ascending: true }),
        supabase.from("purchase_requests").select("*, product:products(name)").eq("thread_id", threadId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("profiles").select("id, display_name, avatar_url, is_verified, is_owner").eq("id", participantId).maybeSingle(),
      ]);
      await markChatThreadRead(user.id, threadId);
      if (active) {
        setThread(threadData);
        setParticipant(profile);
        setMessages(msgs || []);
        setRequest(req || null);
        setLoading(false);
      }
    }

    load();
    const channel = supabase.channel(`chat_thread_${threadId}`).on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages", filter: `thread_id=eq.${threadId}` }, (payload) => {
      setMessages((prev) => prev.some((message) => message.id === payload.new.id) ? prev : [...prev, payload.new]);
      if (payload.new.sender_id !== user.id) markChatThreadRead(user.id, threadId);
    }).subscribe();
    return () => { active = false; supabase.removeChannel(channel); };
  }, [threadId, user]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  async function sendMessage(e) {
    e.preventDefault();
    if (!text.trim() || !user) return;
    const content = text.trim();
    setText("");
    await supabase.from("chat_messages").insert({ thread_id: threadId, sender_id: user.id, content });
  }

  async function sendAttachment({ url, type }) {
    if (!user) return;
    await supabase.from("chat_messages").insert({ thread_id: threadId, sender_id: user.id, content: type === "video" ? "Video" : "Gambar", attachment_url: url, attachment_type: type });
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

      {request && <div className="chat-request-wrap"><PurchaseRequestCard request={request} isSeller={user.id === request.seller_id} currentUserId={user.id} onUpdate={setRequest} /></div>}

      <div className="chat-messages" aria-live="polite">
        <div className="chat-day-label">Percakapan Storichi</div>
        {messages.map((message) => (
          <div key={message.id} className={`chat-message-row ${message.sender_id === user.id ? "is-mine" : "is-theirs"}`}>
            <div className="chat-bubble">
              {message.attachment_url ? (message.attachment_type === "video" ? <video src={message.attachment_url} controls className="chat-attachment-media" /> : <img src={message.attachment_url} alt="Lampiran pesan" className="chat-attachment-media" />) : <span>{message.content}</span>}
              <time>{formatMessageTime(message.created_at)}</time>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <form className="chat-input-bar" onSubmit={sendMessage}>
        <AttachmentButton userId={user.id} onUploaded={sendAttachment} />
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Tulis pesan..." aria-label="Tulis pesan" />
        <button type="submit" className="chat-send-button" disabled={!text.trim()} aria-label="Kirim pesan">↑</button>
      </form>
    </main>
  );
}
