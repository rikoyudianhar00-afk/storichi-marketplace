import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";

export default function RekberRoom() {
  const { groupId } = useParams();
  const { user } = useAuth();
  const [group, setGroup] = useState(null);
  const [members, setMembers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef(null);

  const isCreator = group?.created_by === user?.id;

  useEffect(() => {
    async function load() {
      const [{ data: g }, { data: m }, { data: msgs }] = await Promise.all([
        supabase.from("rekber_groups").select("*").eq("id", groupId).single(),
        supabase.from("rekber_members").select("*, profile:profiles(display_name, avatar_url)").eq("group_id", groupId),
        supabase.from("rekber_messages").select("*").eq("group_id", groupId).order("created_at", { ascending: true }),
      ]);
      setGroup(g);
      setMembers(m || []);
      setMessages(msgs || []);
      setLoading(false);
    }
    load();

    const channel = supabase
      .channel(`rekber_${groupId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "rekber_messages", filter: `group_id=eq.${groupId}` },
        (payload) => setMessages((prev) => [...prev, payload.new])
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "rekber_members", filter: `group_id=eq.${groupId}` },
        () => refreshMembers()
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [groupId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function refreshMembers() {
    const { data } = await supabase
      .from("rekber_members")
      .select("*, profile:profiles(display_name, avatar_url)")
      .eq("group_id", groupId);
    setMembers(data || []);
  }

  async function sendMessage(e) {
    e.preventDefault();
    if (!text.trim() || !user) return;
    const content = text.trim();
    setText("");
    await supabase.from("rekber_messages").insert({
      group_id: groupId,
      sender_id: user.id,
      content,
    });
  }

  async function updateStatus(status) {
    await supabase.from("rekber_groups").update({ status }).eq("id", groupId);
    setGroup((g) => ({ ...g, status }));
  }

  if (loading) return <div className="container skeleton" style={{ height: 300, marginTop: 20 }} />;
  if (!group) return <div className="container empty-state"><p>Grup tidak ditemukan.</p></div>;

  return (
    <main className="chat-thread-page">
      <div className="rekber-room-header container">
        <div>
          <h2 style={{ margin: 0 }}>{group.name}</h2>
          <p className="thread-item-sub">
            Kode: <strong>{group.code}</strong> · {members.length} anggota
          </p>
        </div>
        <span className={"status-pill status-" + group.status}>
          {group.status === "active" ? "Aktif" : group.status === "completed" ? "Selesai" : "Batal"}
        </span>
      </div>

      {isCreator && group.status === "active" && (
        <div className="rekber-room-actions container">
          <button className="btn btn-outline" onClick={() => updateStatus("completed")}>
            Tandai Selesai
          </button>
          <button className="btn btn-outline" onClick={() => updateStatus("cancelled")}>
            Batalkan
          </button>
        </div>
      )}

      <div className="chat-messages">
        {messages.map((m) => (
          <div key={m.id} className={"chat-bubble" + (m.sender_id === user?.id ? " chat-bubble-mine" : "")}>
            {m.content}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {group.status === "active" ? (
        <form className="chat-input-bar" onSubmit={sendMessage}>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Tulis pesan ke grup..."
            aria-label="Tulis pesan"
          />
          <button type="submit" className="btn btn-primary" disabled={!text.trim()}>
            Kirim
          </button>
        </form>
      ) : (
        <p style={{ textAlign: "center", color: "var(--ink-500)", padding: 16 }}>
          Grup ini sudah {group.status === "completed" ? "selesai" : "dibatalkan"}.
        </p>
      )}
    </main>
  );
}
