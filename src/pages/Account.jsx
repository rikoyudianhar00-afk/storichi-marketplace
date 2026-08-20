import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import RoleBadge from "../components/RoleBadge";
import ImageCropModal from "../components/ImageCropModal";
import { MAX_IMAGE_SIZE_BYTES, validateImageFile } from "../lib/image";

export default function Account() {
  const { user, profile, signInWithGoogle, signOut, refreshProfile } = useAuth();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(profile?.display_name || "");
  const [bio, setBio] = useState(profile?.bio || "");
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cropSource, setCropSource] = useState(null);
  const [imageError, setImageError] = useState("");

  const [tagEmail, setTagEmail] = useState("");
  const [tagType, setTagType] = useState("is_verified");
  const [tagMsg, setTagMsg] = useState("");

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

  function handlePickAvatar(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const fileError = validateImageFile(file);
    if (fileError) {
      setImageError(fileError);
      return;
    }
    setImageError("");
    setCropSource(file);
  }

  async function handleCropConfirm(blob) {
    setCropSource(null);
    if (blob.size > MAX_IMAGE_SIZE_BYTES) {
      setImageError("Ukuran foto hasil pengolahan melebihi 5 MB. Pilih foto lain atau kurangi zoom.");
      return;
    }

    setImageError("");
    setAvatarUploading(true);
    const path = `${user.id}/avatar-${Date.now()}.jpg`;
    const { error } = await supabase.storage.from("product-images").upload(path, blob, { contentType: "image/jpeg" });
    if (!error) {
      const { data } = supabase.storage.from("product-images").getPublicUrl(path);
      await supabase.from("profiles").update({ avatar_url: data.publicUrl }).eq("id", user.id);
      refreshProfile?.();
    }
    setAvatarUploading(false);
  }

  async function saveProfile() {
    if (!name.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update({ display_name: name.trim(), bio: bio.trim().slice(0, 500) }).eq("id", user.id);
    if (error) setImageError("Profil gagal disimpan. Pastikan migrasi bio sudah dijalankan.");
    else {
      refreshProfile?.();
      setEditing(false);
    }
    setSaving(false);
  }

  async function assignTag(e) {
    e.preventDefault();
    setTagMsg("");
    const { data: target } = await supabase.from("profiles").select("id").eq("email", tagEmail.trim()).maybeSingle();
    if (!target) {
      setTagMsg("Email tidak ditemukan.");
      return;
    }
    const { error } = await supabase.from("profiles").update({ [tagType]: true }).eq("id", target.id);
    setTagMsg(error ? "Gagal menerapkan tag." : `Berhasil menambahkan tag ke ${tagEmail}.`);
    setTagEmail("");
  }

  return (
    <main className="container">
      {cropSource && (
        <ImageCropModal
          source={cropSource}
          aspect="square"
          onCancel={() => setCropSource(null)}
          onConfirm={handleCropConfirm}
          onError={(message) => {
            setCropSource(null);
            setImageError(message);
          }}
        />
      )}
      {imageError && <p className="form-error">{imageError}</p>}

      <div className="account-card">
        <div style={{ position: "relative" }}>
          <div className="account-avatar">
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="" />
            ) : (
              <span>{(profile?.display_name || "U")[0].toUpperCase()}</span>
            )}
          </div>
          <label className="avatar-edit-btn">
            {avatarUploading ? "..." : "✎"}
            <input type="file" accept="image/*" hidden onChange={handlePickAvatar} disabled={avatarUploading} />
          </label>
          {profile?.avatar_url && !avatarUploading && (
            <button
              type="button"
              className="avatar-reposition-btn"
              onClick={() => setCropSource(profile.avatar_url)}
              aria-label="Reposisi foto profil"
              title="Reposisi"
            >
              ⤢
            </button>
          )}
        </div>
        <div>
          {editing ? (
            <div className="profile-edit-fields">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama tampilan" />
              <textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={500} rows={3} placeholder="Bio penjual, misalnya spesialisasi dan jam online..." />
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-primary" style={{ padding: "6px 14px" }} onClick={saveProfile} disabled={saving}>Simpan</button>
                <button className="btn btn-outline" style={{ padding: "6px 14px" }} onClick={() => setEditing(false)} type="button">Batal</button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <h2 style={{ margin: 0 }}>{profile?.display_name}</h2>
              <RoleBadge profile={profile} />
              <button className="link-btn" onClick={() => setEditing(true)}>
                Edit
              </button>
            </div>
          )}
          <p style={{ margin: "4px 0 0", color: "var(--ink-500)" }}>{profile?.email}</p>
          {profile?.bio && !editing && <p className="profile-bio">{profile.bio}</p>}
        </div>
      </div>

      <div className="account-links">
        <Link to="/jual" className="thread-item">
          <span>📦 Produk Saya</span>
        </Link>
        <Link to="/rekber" className="thread-item">
          <span>🤝 Grup Rekber</span>
        </Link>
      </div>

      {profile?.is_owner && (
        <div className="owner-panel">
          <h3 style={{ fontSize: 15, marginBottom: 10 }}>Panel Owner</h3>
          <Link to="/kelola-kategori" className="thread-item" style={{ marginBottom: 14 }}>
            <span>🖼️ Kelola Kategori</span>
          </Link>
          <Link to="/kelola-iklan" className="thread-item" style={{ marginBottom: 14 }}>
            <span>📣 Kelola Iklan Beranda</span>
          </Link>
          <h4 style={{ fontSize: 13.5, marginBottom: 8 }}>Kelola Tag Pengguna</h4>
          <form onSubmit={assignTag} className="card-form" style={{ padding: 16 }}>
            <input
              value={tagEmail}
              onChange={(e) => setTagEmail(e.target.value)}
              placeholder="Email pengguna"
              style={{ marginBottom: 10 }}
            />
            <select value={tagType} onChange={(e) => setTagType(e.target.value)} style={{ marginBottom: 10, width: "100%", padding: 10, borderRadius: 10, border: "1px solid var(--border)" }}>
              <option value="is_verified">Tandai Terverifikasi (centang biru)</option>
              <option value="is_midman">Tandai Mid Man</option>
            </select>
            {tagMsg && <p className="thread-item-sub" style={{ marginBottom: 8 }}>{tagMsg}</p>}
            <button className="btn btn-primary btn-full">Terapkan Tag</button>
          </form>
        </div>
      )}

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
