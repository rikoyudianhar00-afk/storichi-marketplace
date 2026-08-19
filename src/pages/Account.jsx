import { useAuth } from "../context/AuthContext";

export default function Account() {
  const { user, profile, signInWithGoogle, signOut } = useAuth();

  if (!user) {
    return (
      <main className="container empty-state">
        <h2>Masuk ke Storichi</h2>
        <p>Gunakan akun Google kamu untuk mulai transaksi, chat, dan rekber.</p>
        <button className="btn btn-primary" onClick={signInWithGoogle} style={{ marginTop: 16 }}>
          <GoogleIcon /> Masuk dengan Google
        </button>
      </main>
    );
  }

  return (
    <main className="container">
      <div className="account-card">
        <div className="account-avatar">
          {profile?.avatar_url ? (
            <img src={profile.avatar_url} alt="" />
          ) : (
            <span>{(profile?.display_name || "U")[0].toUpperCase()}</span>
          )}
        </div>
        <div>
          <h2 style={{ margin: "0 0 4px" }}>{profile?.display_name}</h2>
          <p style={{ margin: 0, color: "var(--ink-500)" }}>{profile?.email}</p>
        </div>
      </div>
      <button className="btn btn-outline" onClick={signOut} style={{ marginTop: 20 }}>
        Keluar
      </button>
    </main>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" style={{ marginRight: 8, verticalAlign: -3 }}>
      <path fill="#4285F4" d="M23.5 12.3c0-.9-.1-1.6-.2-2.3H12v4.4h6.5c-.3 1.4-1.1 2.6-2.4 3.4v2.9h3.9c2.3-2.1 3.5-5.2 3.5-8.4Z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-2.9c-1.1.7-2.5 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9H1.3v3C3.2 21.3 7.3 24 12 24Z" />
      <path fill="#FBBC05" d="M5.4 14.5c-.2-.7-.4-1.4-.4-2.2s.1-1.5.4-2.2v-3H1.3C.5 8.7 0 10.3 0 12s.5 3.3 1.3 4.9l4.1-3.2v.8Z" />
      <path fill="#EA4335" d="M12 4.8c1.7 0 3.3.6 4.5 1.7l3.4-3.4C17.9 1.2 15.2 0 12 0 7.3 0 3.2 2.7 1.3 6.7l4.1 3.2C6.3 6.9 8.9 4.8 12 4.8Z" />
    </svg>
  );
}
