import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import ImageCropModal from "../components/ImageCropModal";
import { MAX_IMAGE_SIZE_BYTES, validateImageFile } from "../lib/image";

function slugify(text) {
  return text.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export default function ManageCategories() {
  const { user, profile } = useAuth();
  const [categories, setCategories] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newLabel, setNewLabel] = useState("");
  const [newGroupLabel, setNewGroupLabel] = useState("");
  const [groupSaving, setGroupSaving] = useState(false);
  const [uploadingId, setUploadingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [cropTarget, setCropTarget] = useState(null); // { categoryId, source }
  const [imageError, setImageError] = useState("");

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const [{ data: categoryData }, { data: groupData }] = await Promise.all([
      supabase.from("categories").select("*").order("sort_order", { ascending: true }),
      supabase.from("category_groups").select("*").order("sort_order", { ascending: true }),
    ]);
    setCategories(categoryData || []);
    setGroups(groupData || []);
    setLoading(false);
  }

  async function addGroup(e) {
    e.preventDefault();
    if (!newGroupLabel.trim()) return;
    setGroupSaving(true);
    const slug = slugify(newGroupLabel) + "-" + Math.random().toString(36).slice(2, 5);
    const maxOrder = groups.length ? Math.max(...groups.map((g) => g.sort_order || 0)) : 0;
    const { data, error } = await supabase
      .from("category_groups")
      .insert({ slug, label: newGroupLabel.trim(), sort_order: maxOrder + 1 })
      .select()
      .single();
    if (error) setImageError("Gagal membuat grup kategori.");
    if (data) setGroups((prev) => [...prev, data]);
    setNewGroupLabel("");
    setGroupSaving(false);
  }

  async function renameGroup(groupId, label) {
    const nextLabel = label.trim();
    if (!nextLabel) return;
    await supabase.from("category_groups").update({ label: nextLabel }).eq("id", groupId);
    setGroups((prev) => prev.map((g) => (g.id === groupId ? { ...g, label: nextLabel } : g)));
  }

  async function deleteGroup(groupId) {
    if (!confirm("Hapus grup ini? Kategori di dalamnya tetap ada dan menjadi kategori mandiri.")) return;
    await supabase.from("category_groups").delete().eq("id", groupId);
    setGroups((prev) => prev.filter((g) => g.id !== groupId));
    setCategories((prev) => prev.map((c) => (c.group_id === groupId ? { ...c, group_id: null } : c)));
  }

  async function assignCategoryGroup(categoryId, groupId) {
    const nextGroupId = groupId || null;
    await supabase.from("categories").update({ group_id: nextGroupId }).eq("id", categoryId);
    setCategories((prev) => prev.map((c) => (c.id === categoryId ? { ...c, group_id: nextGroupId } : c)));
  }

  async function addCategory(e) {
    e.preventDefault();
    if (!newLabel.trim()) return;
    setSaving(true);
    const slug = slugify(newLabel) + "-" + Math.random().toString(36).slice(2, 5);
    const maxOrder = categories.length ? Math.max(...categories.map((c) => c.sort_order)) : 0;
    const { data } = await supabase
      .from("categories")
      .insert({ slug, label: newLabel.trim(), sort_order: maxOrder + 1 })
      .select()
      .single();
    if (data) setCategories((prev) => [...prev, data]);
    setNewLabel("");
    setSaving(false);
  }

  function pickImage(categoryId, file) {
    if (!file) return;
    const fileError = validateImageFile(file);
    if (fileError) {
      setImageError(fileError);
      return;
    }
    setImageError("");
    setCropTarget({ categoryId, source: file });
  }

  function repositionImage(categoryId, imageUrl) {
    setCropTarget({ categoryId, source: imageUrl });
  }

  async function handleCropConfirm(blob) {
    const { categoryId } = cropTarget;
    setCropTarget(null);
    if (blob.size > MAX_IMAGE_SIZE_BYTES) {
      setImageError("Ukuran foto hasil pengolahan melebihi 5 MB. Pilih foto lain atau kurangi zoom.");
      return;
    }

    setImageError("");
    setUploadingId(categoryId);
    const path = `${categoryId}-${Date.now()}.jpg`;
    const { error } = await supabase.storage.from("category-images").upload(path, blob, { contentType: "image/jpeg" });
    if (!error) {
      const { data } = supabase.storage.from("category-images").getPublicUrl(path);
      await supabase.from("categories").update({ image_url: data.publicUrl }).eq("id", categoryId);
      setCategories((prev) => prev.map((c) => (c.id === categoryId ? { ...c, image_url: data.publicUrl } : c)));
    }
    setUploadingId(null);
  }

  async function renameCategory(categoryId, label) {
    await supabase.from("categories").update({ label }).eq("id", categoryId);
  }

  async function deleteCategory(categoryId) {
    if (!confirm("Hapus kategori ini? Produk di kategori ini tidak ikut terhapus.")) return;
    await supabase.from("categories").delete().eq("id", categoryId);
    setCategories((prev) => prev.filter((c) => c.id !== categoryId));
  }

  if (!user || !profile?.is_owner) {
    return (
      <main className="container empty-state">
        <h2>Halaman khusus Owner</h2>
        <p>Kamu tidak memiliki akses ke halaman ini.</p>
      </main>
    );
  }

  if (loading) return <div className="container skeleton" style={{ height: 240, marginTop: 20 }} />;

  return (
    <main className="container" style={{ paddingBottom: 40 }}>
      {cropTarget && (
        <ImageCropModal
          source={cropTarget.source}
          aspect="square"
          onCancel={() => setCropTarget(null)}
          onConfirm={handleCropConfirm}
          onError={(message) => {
            setCropTarget(null);
            setImageError(message);
          }}
        />
      )}

      <h1 className="page-title">Kelola Kategori</h1>
      {imageError && <p className="form-error">{imageError}</p>}
      <p className="page-subtitle">Atur grup sebagai pintu luar, lalu tetapkan kategori mana yang berada di dalamnya.</p>

      <section className="category-group-manager">
        <h2 className="category-manager-heading">Grup kategori / pintu luar</h2>
        <form onSubmit={addGroup} className="invite-form" style={{ marginBottom: 12 }}>
          <input value={newGroupLabel} onChange={(e) => setNewGroupLabel(e.target.value)} placeholder="Nama grup baru, misalnya Game" />
          <button className="btn btn-primary" disabled={groupSaving}>{groupSaving ? "..." : "+ Grup"}</button>
        </form>
        {groups.length > 0 && (
          <div className="category-group-list">
            {groups.map((group) => (
              <div key={group.id} className="category-group-row">
                <input defaultValue={group.label} onBlur={(e) => renameGroup(group.id, e.target.value)} aria-label={`Nama grup ${group.label}`} />
                <button type="button" className="btn btn-outline" onClick={() => deleteGroup(group.id)}>Hapus</button>
              </div>
            ))}
          </div>
        )}
      </section>

      <form onSubmit={addCategory} className="invite-form" style={{ marginBottom: 20 }}>
        <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Nama kategori baru" />
        <button className="btn btn-primary" disabled={saving}>
          {saving ? "..." : "+ Tambah"}
        </button>
      </form>

      <div className="category-manage-list">
        {categories.map((cat) => (
          <div key={cat.id} className="category-manage-item">
            <label className="category-manage-thumb">
              {uploadingId === cat.id ? (
                <span className="attachment-spinner" />
              ) : cat.image_url ? (
                <img src={cat.image_url} alt="" />
              ) : (
                <span className="category-tile-fallback">{cat.label[0]}</span>
              )}
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  pickImage(cat.id, e.target.files?.[0]);
                  e.target.value = "";
                }}
                disabled={uploadingId === cat.id}
              />
            </label>
            <input
              className="category-manage-name"
              defaultValue={cat.label}
              onBlur={(e) => renameCategory(cat.id, e.target.value)}
            />
            <select
              className="category-group-select"
              value={cat.group_id || ""}
              onChange={(e) => assignCategoryGroup(cat.id, e.target.value)}
              aria-label={`Gro​​up untuk kategori ${cat.label}`}
            >
              <option value="">Kategori mandiri</option>
              {groups.map((group) => <option key={group.id} value={group.id}>{group.label}</option>)}
            </select>
            {cat.image_url && (
              <button
                type="button"
                className="btn btn-outline"
                style={{ padding: "8px 12px", fontSize: 12.5 }}
                onClick={() => repositionImage(cat.id, cat.image_url)}
                disabled={uploadingId === cat.id}
              >
                Reposisi
              </button>
            )}
            <button
              className="btn btn-outline"
              style={{ padding: "8px 12px", fontSize: 12.5, color: "var(--accent-coral)", borderColor: "var(--accent-coral)" }}
              onClick={() => deleteCategory(cat.id)}
            >
              Hapus
            </button>
          </div>
        ))}
      </div>
    </main>
  );
}
