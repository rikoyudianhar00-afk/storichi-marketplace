import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";

function slugify(text) {
  return (
    text
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") +
    "-" +
    Math.random().toString(36).slice(2, 7)
  );
}

export default function SellProduct() {
  const { productId } = useParams(); // present when editing
  const { user, signInWithGoogle } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [categories, setCategories] = useState([]);
  const [category, setCategory] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState(1);
  const [description, setDescription] = useState("");
  const [images, setImages] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [loadingExisting, setLoadingExisting] = useState(!!productId);

  useEffect(() => {
    supabase
      .from("categories")
      .select("*")
      .order("sort_order", { ascending: true })
      .then(({ data }) => {
        setCategories(data || []);
        if (data?.length && !category) setCategory(data[0].slug);
      });
  }, []);

  useEffect(() => {
    if (!productId) return;
    supabase
      .from("products")
      .select("*")
      .eq("id", productId)
      .single()
      .then(({ data }) => {
        if (data) {
          setName(data.name);
          setCategory(data.category);
          setPrice(data.price_from || "");
          setStock(data.stock ?? 1);
          setDescription(data.description || "");
          setImages(data.images?.length ? data.images : data.image_url ? [data.image_url] : []);
        }
        setLoadingExisting(false);
      });
  }, [productId]);

  async function handleImageUpload(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length || !user) return;
    setUploading(true);
    const uploaded = [];

    for (const file of files) {
      const path = `${user.id}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage.from("product-images").upload(path, file);
      if (!uploadError) {
        const { data } = supabase.storage.from("product-images").getPublicUrl(path);
        uploaded.push(data.publicUrl);
      }
    }

    setImages((prev) => [...prev, ...uploaded]);
    setUploading(false);
  }

  function removeImage(idx) {
    setImages((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!user) return signInWithGoogle();
    setError("");

    if (!name.trim() || !price) {
      setError("Judul dan harga wajib diisi.");
      return;
    }

    setSaving(true);

    const payload = {
      name: name.trim(),
      category,
      price_from: Number(price),
      stock: Number(stock) || 1,
      description: description.trim(),
      images,
      image_url: images[0] || null,
      seller_id: user.id,
    };

    if (productId) {
      const { error: updateError } = await supabase.from("products").update(payload).eq("id", productId);
      setSaving(false);
      if (updateError) return setError("Gagal menyimpan perubahan.");
      navigate(`/produk/${productId}`);
    } else {
      const { data, error: insertError } = await supabase
        .from("products")
        .insert({ ...payload, slug: slugify(name) })
        .select()
        .single();
      setSaving(false);
      if (insertError) return setError("Gagal membuat produk.");
      navigate(`/produk/${data.slug}`);
    }
  }

  if (!user) {
    return (
      <main className="container empty-state">
        <h2>Masuk untuk menjual produk</h2>
        <button className="btn btn-primary" onClick={signInWithGoogle} style={{ marginTop: 12 }}>
          Masuk dengan Google
        </button>
      </main>
    );
  }

  if (loadingExisting) return <div className="container skeleton" style={{ height: 300, marginTop: 20 }} />;

  return (
    <main className="container" style={{ paddingBottom: 40 }}>
      <h1 className="page-title">{productId ? "Edit Produk" : "Jual Produk Baru"}</h1>

      <form className="sell-form" onSubmit={handleSubmit}>
        <label className="form-label">Gambar Produk</label>
        <div className="image-upload-grid">
          {images.map((img, i) => (
            <div key={i} className="image-upload-item">
              <img src={img} alt="" />
              <button type="button" onClick={() => removeImage(i)} aria-label="Hapus gambar">
                ×
              </button>
            </div>
          ))}
          <label className="image-upload-add">
            {uploading ? "..." : "+ Tambah"}
            <input type="file" accept="image/*" multiple onChange={handleImageUpload} hidden disabled={uploading} />
          </label>
        </div>

        <label className="form-label">Judul Produk</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Contoh: 100 Diamond Mobile Legends" required />

        <label className="form-label">Kategori</label>
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          {categories.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.label}
            </option>
          ))}
        </select>

        <div className="form-row-2">
          <div>
            <label className="form-label">Harga (Rp)</label>
            <input type="number" min="0" value={price} onChange={(e) => setPrice(e.target.value)} required />
          </div>
          <div>
            <label className="form-label">Stok</label>
            <input type="number" min="0" value={stock} onChange={(e) => setStock(e.target.value)} />
          </div>
        </div>

        <label className="form-label">Deskripsi</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={5}
          placeholder="Jelaskan detail produk, syarat, dan cara pengiriman..."
        />

        {error && <p className="form-error">{error}</p>}

        <button className="btn btn-primary btn-full" disabled={saving} style={{ marginTop: 8 }}>
          {saving ? "Menyimpan..." : productId ? "Simpan Perubahan" : "Terbitkan Produk"}
        </button>
      </form>
    </main>
  );
}
