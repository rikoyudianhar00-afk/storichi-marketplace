import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";

const blank = { id: null, label: "", href: "", display_order: 0, is_active: true };

export default function ManageNavigation() {
  const { user, profile } = useAuth();
  const [links, setLinks] = useState([]);
  const [form, setForm] = useState(blank);
  const [message, setMessage] = useState("");
  useEffect(() => { if (profile?.is_owner) load(); }, [profile?.is_owner]);
  async function load() { const { data } = await supabase.from("navigation_links").select("*").order("display_order").order("created_at"); setLinks(data || []); }
  async function save(event) {
    event.preventDefault();
    const payload = { label: form.label.trim(), href: form.href.trim(), display_order: Number(form.display_order || 0), is_active: form.is_active, created_by: user.id };
    const query = form.id ? supabase.from("navigation_links").update(payload).eq("id", form.id) : supabase.from("navigation_links").insert(payload);
    const { error } = await query;
    setMessage(error ? error.message : "Menu berhasil disimpan.");
    if (!error) { setForm(blank); load(); }
  }
  async function remove(id) { if (!window.confirm("Hapus menu ini?")) return; const { error } = await supabase.from("navigation_links").delete().eq("id", id); setMessage(error ? error.message : "Menu dihapus."); if (!error) load(); }
  if (!user || !profile?.is_owner) return <main className="container empty-state"><p>Halaman ini khusus Owner.</p></main>;
  return <main className="container owner-tools-page"><div className="page-heading"><div><span className="section-kicker">Panel Owner</span><h1 className="page-title">Kelola Menu Drawer</h1></div></div><p className="thread-item-sub">Buat link ke kategori, grup, halaman jual produk, atau alamat eksternal. Menu akan memanjang ke bawah saat ikon garis tiga ditekan.</p><form className="card-form ad-manager-form" onSubmit={save}><input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Nama menu, contoh Top Up Game" required /><input value={form.href} onChange={(e) => setForm({ ...form, href: e.target.value })} placeholder="Link, contoh /kategori/top-up" required /><div className="ad-form-row"><input value={form.display_order} onChange={(e) => setForm({ ...form, display_order: e.target.value })} type="number" min="0" placeholder="Urutan" /><label className="checkbox-row"><input checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} type="checkbox" /> Aktif</label></div>{message && <p className="form-error">{message}</p>}<button className="btn btn-primary">{form.id ? "Simpan perubahan" : "Tambah menu"}</button>{form.id && <button type="button" className="btn btn-outline" onClick={() => setForm(blank)}>Batal edit</button>}</form><div className="ad-manager-list">{links.map((link) => <div key={link.id} className="ad-manager-row"><div><strong>{link.label}</strong><span>{link.href} · {link.is_active ? "Aktif" : "Nonaktif"} · urutan {link.display_order}</span></div><button type="button" className="link-btn" onClick={() => setForm(link)}>Edit</button><button type="button" className="link-btn danger-text" onClick={() => remove(link.id)}>Hapus</button></div>)}</div></main>;
}
