import { useState } from "react";
import { supabase } from "../lib/supabase";

export default function AttachmentButton({ userId, onUploaded, disabled }) {
  const [uploading, setUploading] = useState(false);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !userId) return;

    setUploading(true);
    const path = `${userId}/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from("chat-attachments").upload(path, file);
    if (!error) {
      const { data } = supabase.storage.from("chat-attachments").getPublicUrl(path);
      const isVideo = file.type.startsWith("video/");
      onUploaded({ url: data.publicUrl, type: isVideo ? "video" : "image" });
    }
    setUploading(false);
  }

  return (
    <label className="attachment-btn" aria-label="Kirim gambar atau video">
      {uploading ? (
        <span className="attachment-spinner" />
      ) : (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.8" />
          <circle cx="8.5" cy="10" r="1.5" fill="currentColor" />
          <path d="m4 17 5-5 3.5 3.5L16 12l4 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      <input type="file" accept="image/*,video/*" hidden onChange={handleFile} disabled={disabled || uploading} />
    </label>
  );
}
