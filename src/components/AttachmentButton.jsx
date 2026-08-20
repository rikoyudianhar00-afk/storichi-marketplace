import { useState } from "react";
import { supabase } from "../lib/supabase";
import { compressImageForChat, validateImageFile } from "../lib/image";

export default function AttachmentButton({ userId, onUploaded, disabled }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !userId) return;
    if (file.type.startsWith("image/")) {
      const fileError = validateImageFile(file);
      if (fileError) {
        setError(fileError);
        return;
      }
    }
    setError("");
    setUploading(true);

    try {
      const isImage = file.type.startsWith("image/");
      const uploadFile = isImage ? await compressImageForChat(file, 100 * 1024) : file;
      if (isImage && uploadFile.size > 100 * 1024) {
        setError("Foto masih terlalu besar setelah dikompres. Pilih foto lain atau kurangi resolusinya.");
        return;
      }
      const extension = isImage ? "jpg" : file.name.split(".").pop() || "bin";
      const path = `${userId}/${Date.now()}-${crypto.randomUUID?.() || Math.random().toString(36).slice(2)}.${extension}`;
      const { error: uploadError } = await supabase.storage.from("chat-attachments").upload(path, uploadFile, { contentType: isImage ? "image/jpeg" : file.type });
      if (uploadError) {
        setError("Lampiran gagal diunggah.");
        return;
      }
      const { data } = supabase.storage.from("chat-attachments").getPublicUrl(path);
      onUploaded({ url: data.publicUrl, type: isImage ? "image" : "video", sizeBytes: uploadFile.size });
    } catch {
      setError("Foto tidak dapat dikompres atau diunggah.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <label className="attachment-btn" aria-label="Kirim gambar atau video" title={error || "Kirim gambar atau video"}>
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
