import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";

export default function ChatThread() {
  const { threadId } = useParams();
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef(null);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("thread_id", threadId)
        .order("created_at", { ascending: true });
      setMessages(data || []);
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

  return (
    <main className="chat-thread-page">
      <div className="chat-messages">
        {loading ? (
          <div className="skeleton" style={{ height: 200, margin: 16 }} />
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={"chat-bubble" + (m.sender_id === user?.id ? " chat-bubble-mine" : "")}
            >
              {m.content}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
      <form className="chat-input-bar" onSubmit={sendMessage}>
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
