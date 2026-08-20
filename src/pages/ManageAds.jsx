import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import { validateImageFile } from "../lib/image";
import ImageCropModal from "../components/ImageCropModal";

const emptyForm = { id: null, title: "", image_url: "", target_url: "", alt_text: "", display_order: 0, is_active: true };

export default function ManageAds() {
  const { user, profile } = useAuth();
  const [banners, setBanners] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [pin, setPin] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [cropSource, setCropSource] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  useEffect(() => { if (profile?.is_owner) load(); }, [profile?.is_owner]);
  async function load() {
    const { data } = await supabase.from("ad_banners").select("*").order("display_order").order("created_at");
    setBanners(data || []);
  }

  function handleImage(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const error = validateImageFile(file);
    if (error) { setMessage(error); return; }
    setMessage("Atur posisi gambar agar banner menjadi horizontal 16:9.");
    setCropSource(file);
  }

  async function handleCropConfirm(blob) {
    if (!user?.id) return;
    setUploadingImage(true);
    setMessage("");
    const path = `${user.id}/banner-${Date.now()}.jpg`;
    const { error: uploadError } = await supabase.storage.from("ad-images").upload(path, blob, { upsert: true, contentType: "image/jpeg", cacheControl: "31536000" });
    setUploadingImage(false);
    if (uploadError) { setMessage(uploadError.message); return; }
    const { data } = supabase.storage.from("ad-images").getPublicUrl(path);
    setForm((current) => ({ ...current, image_url: data.publicUrl }));
    setCropSource(null);
    setMessage("Gambar banner berhasil diproses dalam rasio 16:9.");
  }

  function getImageRatio(url) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image.naturalWidth / image.naturalHeight);
      image.onerror = () => reject(new Error("Gambar tidak dapat dimuat untuk diperiksa."));
      image.src = url;
    });
  }

  async function save(e) {
    e.preventDefault();
    setSaving(true); setMessage("");
    try {
      const ratio = await getImageRatio(form.image_url.trim());
      if (!Number.isFinite(ratio) || Math.abs(ratio - 16 / 9) > 0.03) {
        setSaving(false);
        setMessage("Banner harus berbentuk horizontal 16:9. Unggah gambar lalu atur posisinya melalui crop banner.");
        return;
      }
    } catch (error) {
      setSaving(false);
      setMessage(error.message);
      return;
    }
    const { error } = await supabase.rpc("save_owner_ad_banner", {
      p_pin: pin, p_banner_id: form.id, p_title: form.title, p_image_url: form.image_url,
      p_target_url: form.target_url, p_alt_text: form.alt_text, p_display_order: Number(form.display_order || 0), p_is_active: form.is_active,
    });
    setSaving(false);
    if (error) { setMessage(error.message); return; }
    setMessage("Banner berhasil disimpan."); setForm(emptyForm); setPin(""); load();
  }

  async function remove(id) {
    if (!window.confirm("Hapus banner ini?")) return;
    const { error } = await supabase.rpc("delete_owner_ad_banner", { p_pin: pin, p_banner_id: id });
    setMessage(error ? error.message : "Banner berhasil dihapus.");
    if (!error) { setPin(""); load(); }
  }

  if (!user || !profile?.is_owner) return <main className="container empty-state"><p>Halaman ini khusus Owner.</p></main>;
  return (
    <main className="container owner-tools-page">
      <div className="page-heading"><div><span className="section-kicker">Panel Owner</span><h1 className="page-title">Kelola Iklan</h1></div></div>
      <p className="thread-item-sub">PIN pertama yang kamu masukkan akan menjadi PIN pengaman untuk perubahan banner berikutnya.</p>
      <form className="card-form ad-manager-form" onSubmit={save}>
        <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Judul singkat iklan" />
        <input value={form.target_url} onChange={(e) => setForm({ ...form, target_url: e.target.value })} placeholder="Link tujuan, contoh https://..." type="url" required />
        <input value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} placeholder="URL gambar atau unggah gambar 16:9" required />
        <label className="file-input-label">Unggah gambar banner (maks. 5 MB, otomatis 16:9)<input type="file" accept="image/*" onChange={handleImage} /></label>
        <input value={form.alt_text} onChange={(e) => setForm({ ...form, alt_text: e.target.value })} placeholder="Alt text gambar" />
        <div className="ad-form-row"><input value={form.display_order} onChange={(e) => setForm({ ...form, display_order: e.target.value })} type="number" min="0" placeholder="Urutan" /><input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))} placeholder="PIN 4–8 angka" inputMode="numeric" required /></div>
        <label className="checkbox-row"><input checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} type="checkbox" /> Tampilkan di beranda</label>
        {message && <p className="form-error">{message}</p>}
        <button className="btn btn-primary" disabled={saving || uploadingImage}>{saving ? "Menyimpan..." : form.id ? "Simpan perubahan" : "Tambah iklan"}</button>
        {form.id && <button type="button" className="btn btn-outline" onClick={() => { setForm(emptyForm); setPin(""); }}>Batal edit</button>}
      </form>
      <div className="ad-manager-list">{banners.map((banner) => <div key={banner.id} className="ad-manager-row"><img src={banner.image_url} alt="" /><div><strong>{banner.title || "Tanpa judul"}</strong><span>{banner.is_active ? "Aktif" : "Nonaktif"} · urutan {banner.display_order}</span></div><button type="button" className="link-btn" onClick={() => setForm(banner)}>Edit</button><button type="button" className="link-btn danger-text" onClick={() => remove(banner.id)}>Hapus</button></div>)}</div>
      {cropSource && <ImageCropModal source={cropSource} aspect="banner" onCancel={() => setCropSource(null)} onConfirm={handleCropConfirm} onError={setMessage} />}
    </main>
  );
}
