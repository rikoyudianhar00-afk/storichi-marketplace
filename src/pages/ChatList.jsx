import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";

export default function ChatList() {
  const { user } = useAuth();
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    async function load() {
      const { data } = await supabase
        .from("chat_threads")
        .select("*, product:products(name, image_url)")
        .or(`user_a.eq.${user.id},user_b.eq.${user.id}`)
        .order("created_at", { ascending: false });
      setThreads(data || []);
      setLoading(false);
    }
    load();
  }, [user]);

  if (!user) {
    return (
      <main className="container empty-state">
        <h2>Masuk untuk melihat chat</h2>
        <p>Login dengan Google untuk mulai chat dengan penjual atau pembeli.</p>
      </main>
    );
  }

  return (
    <main className="container">
      <h1 className="page-title">Chat</h1>
      {loading ? (
        <div className="skeleton" style={{ height: 200 }} />
      ) : threads.length === 0 ? (
        <div className="empty-state">
          <p>Belum ada percakapan. Mulai chat dari halaman produk.</p>
        </div>
      ) : (
        <div className="thread-list">
          {threads.map((t) => (
            <Link key={t.id} to={`/chat/${t.id}`} className="thread-item">
              <div className="thread-item-avatar">💬</div>
              <div>
                <div className="thread-item-title">{t.product?.name || "Percakapan"}</div>
                <div className="thread-item-sub">Ketuk untuk membuka chat</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
