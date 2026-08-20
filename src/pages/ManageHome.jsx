import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";

const blankForm = { id: null, title: "", icon: "✦", category_label: "", view_all_href: "", display_order: 0, is_active: true };

function sortAssignments(items = []) {
  return [...items].sort((a, b) => Number(a.display_order || 0) - Number(b.display_order || 0) || new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());
}

export default function ManageHome() {
  const { user, profile } = useAuth();
  const [sections, setSections] = useState([]);
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState(blankForm);
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [titleOverrides, setTitleOverrides] = useState({});
  const [productSearch, setProductSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (profile?.is_owner) load();
  }, [profile?.is_owner]);

  async function load() {
    setLoading(true);
    setMessage("");
    const [{ data: sectionData, error: sectionError }, { data: productData, error: productError }] = await Promise.all([
      supabase.from("home_sections").select("*, home_section_products(*, product:products(id, name, slug, image_url, category, price_from, stock, is_active))").order("display_order", { ascending: true }).order("created_at", { ascending: true }),
      supabase.from("products").select("id, name, slug, image_url, category, price_from, stock, is_active").order("created_at", { ascending: false }),
    ]);
    if (sectionError || productError) setMessage("Data Kelola Beranda belum dapat dimuat. Pastikan schema_v16.sql sudah dijalankan.");
    setSections((sectionData || []).map((section) => ({ ...section, home_section_products: sortAssignments(section.home_section_products || []) })));
    setProducts(productData || []);
    setLoading(false);
  }

  function resetForm() {
    setForm(blankForm);
    setSelectedProducts([]);
    setTitleOverrides({});
    setProductSearch("");
  }

  function editSection(section) {
    const assignments = sortAssignments(section.home_section_products || []);
    setForm({ id: section.id, title: section.title, icon: section.icon || "✦", category_label: section.category_label || "", view_all_href: section.view_all_href || "", display_order: section.display_order || 0, is_active: section.is_active !== false });
    setSelectedProducts(assignments.map((assignment) => assignment.product_id));
    setTitleOverrides(Object.fromEntries(assignments.map((assignment) => [assignment.product_id, assignment.title_override || ""])));
    setMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function toggleProduct(productId) {
    setSelectedProducts((current) => current.includes(productId) ? current.filter((id) => id !== productId) : [...current, productId]);
  }

  function moveSelected(productId, direction) {
    setSelectedProducts((current) => {
      const index = current.indexOf(productId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function save(e) {
    e.preventDefault();
    if (!form.title.trim()) return setMessage("Nama box wajib diisi.");
    if (!selectedProducts.length) return setMessage("Tambahkan minimal satu produk ke dalam box.");
    setSaving(true);
    setMessage("");

    const payload = {
      title: form.title.trim().slice(0, 120),
      icon: (form.icon || "✦").trim().slice(0, 8),
      category_label: form.category_label.trim().slice(0, 80),
      view_all_href: form.view_all_href.trim().slice(0, 240),
      display_order: Number(form.display_order || 0),
      is_active: Boolean(form.is_active),
      updated_at: new Date().toISOString(),
    };
    const query = form.id
      ? supabase.from("home_sections").update(payload).eq("id", form.id).select().single()
      : supabase.from("home_sections").insert({ ...payload, created_by: user.id }).select().single();
    const { data: section, error: sectionError } = await query;
    if (sectionError || !section?.id) {
      setSaving(false);
      setMessage(sectionError?.message || "Box Beranda gagal disimpan.");
      return;
    }

    const { error: clearError } = await supabase.from("home_section_products").delete().eq("section_id", section.id);
    if (clearError) {
      setSaving(false);
      setMessage(clearError.message || "Daftar produk box gagal diperbarui.");
      return;
    }
    const assignments = selectedProducts.map((productId, index) => ({ section_id: section.id, product_id: productId, display_order: index, title_override: (titleOverrides[productId] || "").trim().slice(0, 120) }));
    const { error: assignmentError } = await supabase.from("home_section_products").insert(assignments);
    setSaving(false);
    if (assignmentError) {
      setMessage(assignmentError.message || "Produk box gagal disimpan.");
      return;
    }
    setMessage("Box Beranda berhasil disimpan.");
    resetForm();
    await load();
  }

  async function removeSection(sectionId) {
    if (!window.confirm("Hapus box ini dari Beranda? Produk aslinya tidak ikut terhapus.")) return;
    const { error } = await supabase.from("home_sections").delete().eq("id", sectionId);
    if (error) setMessage(error.message || "Box gagal dihapus.");
    else {
      if (form.id === sectionId) resetForm();
      setSections((current) => current.filter((section) => section.id !== sectionId));
      setMessage("Box Beranda berhasil dihapus.");
    }
  }

  const selectedProductObjects = selectedProducts.map((id) => products.find((product) => product.id === id)).filter(Boolean);
  const filteredProducts = useMemo(() => {
    const term = productSearch.trim().toLowerCase();
    return products.filter((product) => !term || [product.name, product.category].some((value) => String(value || "").toLowerCase().includes(term)));
  }, [products, productSearch]);

  if (!user || !profile?.is_owner) return <main className="container empty-state"><p>Halaman ini khusus Owner.</p></main>;

  return (
    <main className="container owner-tools-page home-manager-page">
      <div className="page-heading"><div><span className="section-kicker">Panel Owner</span><h1 className="page-title">Kelola Beranda</h1></div></div>
      <p className="thread-item-sub">Atur box produk yang muncul di Beranda. Mengubah nama di sini hanya mengubah nama tampilan pada box, bukan nama produk asli penjual.</p>
      {message && <p className={message.includes("berhasil") ? "form-success" : "form-error"} role="status">{message}</p>}

      <form className="card-form home-manager-form" onSubmit={save}>
        <h2>{form.id ? "Edit box Beranda" : "Tambah box Beranda"}</h2>
        <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Nama box, contoh: Rekomendasi Mobile Legends" maxLength={120} required />
        <div className="home-manager-form-grid">
          <input value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} placeholder="Ikon, contoh ✦" maxLength={8} />
          <input value={form.category_label} onChange={(e) => setForm({ ...form, category_label: e.target.value })} placeholder="Label kategori, contoh Top Up Game" maxLength={80} />
          <input value={form.display_order} onChange={(e) => setForm({ ...form, display_order: e.target.value })} type="number" min="0" placeholder="Urutan box" />
          <input value={form.view_all_href} onChange={(e) => setForm({ ...form, view_all_href: e.target.value })} placeholder="Link Lihat Semua, contoh /kategori/top-up" maxLength={240} />
        </div>
        <label className="checkbox-row"><input checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} type="checkbox" /> Tampilkan box di Beranda</label>

        <div className="home-manager-selected">
          <div className="home-manager-subheading"><strong>Produk di dalam box ({selectedProductObjects.length})</strong><span>Gunakan tombol ↑ ↓ untuk mengatur urutan.</span></div>
          {!selectedProductObjects.length && <p className="thread-item-sub">Belum ada produk dipilih.</p>}
          {selectedProductObjects.map((product, index) => (
            <div className="home-selected-product" key={product.id}>
              <div className="home-selected-product-thumb">{product.image_url ? <img src={product.image_url} alt="" /> : product.name?.[0] || "P"}</div>
              <div className="home-selected-product-copy"><strong>{product.name}</strong><input value={titleOverrides[product.id] || ""} onChange={(e) => setTitleOverrides((current) => ({ ...current, [product.id]: e.target.value }))} placeholder="Nama tampilan khusus (opsional)" maxLength={120} /></div>
              <div className="home-selected-product-actions"><button type="button" className="link-btn" onClick={() => moveSelected(product.id, -1)} disabled={index === 0} aria-label="Naikkan urutan">↑</button><button type="button" className="link-btn" onClick={() => moveSelected(product.id, 1)} disabled={index === selectedProductObjects.length - 1} aria-label="Turunkan urutan">↓</button><button type="button" className="link-btn danger-text" onClick={() => toggleProduct(product.id)} aria-label={`Hapus ${product.name} dari box`}>×</button></div>
            </div>
          ))}
        </div>

        <div className="home-manager-product-picker">
          <div className="home-manager-subheading"><strong>Tambahkan produk</strong><span>Produk asli tidak terhapus dari marketplace.</span></div>
          <input value={productSearch} onChange={(e) => setProductSearch(e.target.value)} placeholder="Cari nama produk atau kategori..." />
          <div className="home-product-picker-list">
            {filteredProducts.map((product) => <label className={`home-product-picker-row ${selectedProducts.includes(product.id) ? "is-selected" : ""}`} key={product.id}><input type="checkbox" checked={selectedProducts.includes(product.id)} onChange={() => toggleProduct(product.id)} /><span className="home-picker-thumb">{product.image_url ? <img src={product.image_url} alt="" /> : product.name?.[0] || "P"}</span><span><strong>{product.name}</strong><small>{product.category} · {Number(product.stock || 0) > 0 && product.is_active !== false ? "Aktif" : "Tidak aktif"}</small></span></label>)}
            {!filteredProducts.length && <p className="thread-item-sub">Produk tidak ditemukan.</p>}
          </div>
        </div>

        <div className="direct-action-modal-actions"><button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Menyimpan..." : form.id ? "Simpan perubahan" : "Tambah box"}</button>{form.id && <button type="button" className="btn btn-outline" onClick={resetForm}>Batal edit</button>}</div>
      </form>

      <section className="home-manager-list">
        <div className="home-manager-subheading"><strong>Box yang sudah dibuat</strong><span>{loading ? "Memuat..." : `${sections.length} box`}</span></div>
        {!loading && !sections.length && <div className="empty-state"><p>Belum ada box khusus. Section bawaan Beranda tetap berjalan.</p></div>}
        {sections.map((section) => <article className={`home-manager-card ${section.is_active ? "" : "is-inactive"}`} key={section.id}><div className="home-manager-card-head"><div><h3><span>{section.icon}</span> {section.title}</h3><p>{section.category_label || "Tanpa label kategori"} · {section.home_section_products?.length || 0} produk · urutan {section.display_order}</p></div><span className="home-manager-status">{section.is_active ? "Aktif" : "Nonaktif"}</span></div><div className="home-manager-card-products">{sortAssignments(section.home_section_products || []).slice(0, 6).map((assignment) => <span key={assignment.id}>{assignment.title_override || assignment.product?.name || "Produk"}</span>)}</div><div className="home-manager-card-actions"><button type="button" className="link-btn" onClick={() => editSection(section)}>Edit</button><button type="button" className="link-btn danger-text" onClick={() => removeSection(section.id)}>Hapus box</button></div></article>)}
      </section>
    </main>
  );
}
