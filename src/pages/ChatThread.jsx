import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import PurchaseRequestCard from "../components/PurchaseRequestCard";
import AttachmentButton from "../components/AttachmentButton";

export default function ChatThread() {
  const { threadId } = useParams();
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [request, setRequest] = useState(null);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef(null);

  useEffect(() => {
    async function load() {
      const [{ data: msgs }, { data: req }] = await Promise.all([
        supabase.from("chat_messages").select("*").eq("thread_id", threadId).order("created_at", { ascending: true }),
        supabase
          .from("purchase_requests")
          .select("*, product:products(name)")
          .eq("thread_id", threadId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      setMessages(msgs || []);
      setRequest(req || null);
      setLoading(false);
    }
    load();

    const channel = supabase
      .channel(`chat_thread_${threadId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `thread_id=eq.${threadId}` },
        (payload) => setMessages((prev) => [...prev, payload.new])
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [threadId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage(e) {
    e.preventDefault();
    if (!text.trim() || !user) return;
    const content = text.trim();
    setText("");
    await supabase.from("chat_messages").insert({
      thread_id: threadId,
      sender_id: user.id,
      content,
    });
  }

  async function sendAttachment({ url, type }) {
    if (!user) return;
    await supabase.from("chat_messages").insert({
      thread_id: threadId,
      sender_id: user.id,
      content: type === "video" ? "📹 Video" : "🖼️ Gambar",
      attachment_url: url,
      attachment_type: type,
    });
  }

  return (
    <main className="chat-thread-page">
      {!loading && request && (
        <div className="container" style={{ paddingTop: 14 }}>
          <PurchaseRequestCard
            request={request}
            isSeller={user?.id === request.seller_id}
            currentUserId={user?.id}
            onUpdate={setRequest}
          />
        </div>
      )}

      <div className="chat-messages">
        {loading ? (
          <div className="skeleton" style={{ height: 200, margin: 16 }} />
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={"chat-bubble" + (m.sender_id === user?.id ? " chat-bubble-mine" : "")}
            >
              {m.attachment_url ? (
                m.attachment_type === "video" ? (
                  <video src={m.attachment_url} controls className="chat-attachment-media" />
                ) : (
                  <img src={m.attachment_url} alt="" className="chat-attachment-media" />
                )
              ) : (
                m.content
              )}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
      <form className="chat-input-bar" onSubmit={sendMessage}>
        <AttachmentButton userId={user?.id} onUploaded={sendAttachment} />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Tulis pesan..."
          aria-label="Tulis pesan"
        />
        <button type="submit" className="btn btn-primary" disabled={!text.trim()}>
          Kirim
        </button>
      </form>
    </main>
  );
}
