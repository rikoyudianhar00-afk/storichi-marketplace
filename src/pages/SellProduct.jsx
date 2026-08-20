import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import ImageCropModal from "../components/ImageCropModal";
import { MAX_IMAGE_SIZE_BYTES, validateImageFile } from "../lib/image";

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
  const { user, profile, signInWithGoogle } = useAuth();
  const isOwner = Boolean(profile?.is_owner);
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [categories, setCategories] = useState([]);
  const [category, setCategory] = useState("");
  const [gameTags, setGameTags] = useState([]);
  const [selectedTagIds, setSelectedTagIds] = useState([]);
  const [tagName, setTagName] = useState("");
  const [tagImageFile, setTagImageFile] = useState(null);
  const [tagUploading, setTagUploading] = useState(false);
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState(1);
  const [description, setDescription] = useState("");
  const [images, setImages] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [loadingExisting, setLoadingExisting] = useState(!!productId);
  const [cropTarget, setCropTarget] = useState(null); // { source, replaceIndex? }

  useEffect(() => {
    Promise.all([
      supabase.from("categories").select("*").order("sort_order", { ascending: true }),
      supabase.from("game_tags").select("*").eq("is_active", true).order("created_at", { ascending: false }),
    ]).then(([{ data: categoryData }, { data: tagData }]) => {
      setCategories(categoryData || []);
      setGameTags(tagData || []);
      if (categoryData?.length && !category) setCategory(categoryData[0].slug);
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
          supabase.from("product_game_tags").select("tag_id").eq("product_id", productId).then(({ data: links }) => {
            setSelectedTagIds((links || []).map((link) => link.tag_id));
          });
        }
        setLoadingExisting(false);
      });
  }, [productId]);

  function pickThumbnail(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const fileError = validateImageFile(file);
    if (fileError) return setError(fileError);
    setError("");
    setCropTarget({ source: file, replaceIndex: images.length ? 0 : null, aspect: "square" });
  }

  async function pickAdditionalImages(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    const invalidFile = files.map(validateImageFile).find(Boolean);
    if (invalidFile) return setError(invalidFile);
    if (!user) return signInWithGoogle();
    setError("");
    setUploading(true);
    const uploadedUrls = [];
    for (const file of files) {
      const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.jpg`;
      const { error: uploadError } = await supabase.storage.from("product-images").upload(path, file, { contentType: file.type || "image/jpeg" });
      if (uploadError) {
        setUploading(false);
        setError("Sebagian gambar informasi tambahan gagal diunggah.");
        return;
      }
      const { data } = supabase.storage.from("product-images").getPublicUrl(path);
      uploadedUrls.push(data.publicUrl);
    }
    setImages((prev) => [...prev, ...uploadedUrls]);
    setUploading(false);
  }

  function repositionImage(idx) {
    if (idx !== 0 || !images[0]) return;
    setCropTarget({ source: images[0], replaceIndex: 0, aspect: "square" });
  }

  async function handleCropConfirm(blob) {
    const { replaceIndex } = cropTarget || {};
    if (!user) return;
    if (blob.size > MAX_IMAGE_SIZE_BYTES) {
      setError("Ukuran foto hasil pengolahan melebihi 5 MB. Kurangi zoom atau pilih foto lain.");
      setCropTarget(null);
      return;
    }

    setError("");
    setUploading(true);
    const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.jpg`;
    const { error: uploadError } = await supabase.storage.from("product-images").upload(path, blob, { contentType: "image/jpeg" });
    if (uploadError) {
      setUploading(false);
      setCropTarget(null);
      setError("Gambar gagal diunggah.");
      return;
    }
    const { data } = supabase.storage.from("product-images").getPublicUrl(path);
    setImages((prev) => {
      if (replaceIndex != null && prev.length) return prev.map((img, i) => (i === replaceIndex ? data.publicUrl : img));
      return [...prev, data.publicUrl];
    });
    setCropTarget(null);
    setUploading(false);
  }

  function removeImage(idx) {
    setImages((prev) => prev.filter((_, i) => i !== idx));
  }

  function pickTagImage(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const fileError = validateImageFile(file);
    if (fileError) {
      setError(fileError);
      return;
    }
    setTagImageFile(file);
    setError("");
  }

  async function createGameTag() {
    if (!user) return signInWithGoogle();
    if (!isOwner) {
      setError("Hanya Owner yang dapat membuat tag game.");
      return;
    }
    if (!tagName.trim() || !tagImageFile) {
      setError("Nama tag dan gambar tag wajib diisi.");
      return;
    }
    setTagUploading(true);
    setError("");
    const path = `${user.id}/${Date.now()}-${slugify(tagName)}.jpg`;
    const { error: uploadError } = await supabase.storage.from("game-tag-images").upload(path, tagImageFile, { upsert: false });
    if (uploadError) {
      setTagUploading(false);
      setError("Gagal mengunggah gambar tag. Pastikan migrasi tag game sudah dijalankan.");
      return;
    }
    const { data: publicData } = supabase.storage.from("game-tag-images").getPublicUrl(path);
    const { data: createdTag, error: tagError } = await supabase
      .from("game_tags")
      .insert({ seller_id: user.id, name: tagName.trim(), image_url: publicData.publicUrl })
      .select()
      .single();
    setTagUploading(false);
    if (tagError) {
      setError("Gagal membuat tag game.");
      return;
    }
    setGameTags((prev) => [createdTag, ...prev]);
    setSelectedTagIds((prev) => [...new Set([...prev, createdTag.id])]);
    setTagName("");
    setTagImageFile(null);
  }

  function toggleTag(tagId) {
    setSelectedTagIds((prev) => (prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]));
  }

  async function saveProductTags(productId) {
    await supabase.from("product_game_tags").delete().eq("product_id", productId);
    if (selectedTagIds.length) {
      await supabase.from("product_game_tags").insert(selectedTagIds.map((tagId) => ({ product_id: productId, tag_id: tagId })));
    }
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
      is_active: Number(stock) > 0,
      description: description.trim(),
      images,
      image_url: images[0] || null,
      seller_id: user.id,
    };

    if (productId) {
      const { error: updateError } = await supabase.from("products").update(payload).eq("id", productId);
      if (!updateError) await saveProductTags(productId);
      setSaving(false);
      if (updateError) return setError("Gagal menyimpan perubahan.");
      navigate(`/produk/${productId}`);
    } else {
      const { data, error: insertError } = await supabase
        .from("products")
        .insert({ ...payload, slug: slugify(name) })
        .select()
        .single();
      if (!insertError && data?.id) await saveProductTags(data.id);
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
      {cropTarget && (
        <ImageCropModal
          source={cropTarget.source}
          aspect={cropTarget.aspect || "free"}
          onCancel={() => setCropTarget(null)}
          onConfirm={handleCropConfirm}
          onError={(message) => {
            setCropTarget(null);
            setError(message);
          }}
        />
      )}

      <h1 className="page-title">{productId ? "Edit Produk" : "Jual Produk Baru"}</h1>

      <form className="sell-form" onSubmit={handleSubmit}>
        <label className="form-label">Thumbnail Produk</label>
        <div className="product-thumbnail-upload">
          {images[0] ? <img src={images[0]} alt="Thumbnail produk" /> : <span>Belum ada thumbnail</span>}
          {images[0] && <button type="button" className="image-reposition-btn" onClick={() => repositionImage(0)} aria-label="Reposisi thumbnail">⤢</button>}
          {images[0] && <button type="button" className="image-remove-btn" onClick={() => removeImage(0)} aria-label="Hapus thumbnail">×</button>}
          <label className="image-upload-add">{uploading ? "..." : images[0] ? "Ganti thumbnail" : "+ Pilih thumbnail"}<input type="file" accept="image/*" onChange={pickThumbnail} hidden disabled={uploading} /></label>
        </div>

        <label className="form-label">Foto Informasi Tambahan</label>
        <div className="image-upload-grid">
          {images.slice(1).map((img, offset) => {
            const i = offset + 1;
            return <div key={i} className="image-upload-item"><img src={img} alt="" /><button type="button" className="image-remove-btn" onClick={() => removeImage(i)} aria-label="Hapus gambar">×</button></div>;
          })}
          <label className="image-upload-add">{uploading ? "..." : "+ Pilih banyak foto"}<input type="file" accept="image/*" multiple onChange={pickAdditionalImages} hidden disabled={uploading} /></label>
        </div>
        <p className="field-hint">Thumbnail selalu diproses 1:1. Foto informasi tambahan dapat dipilih sekaligus tanpa crop, reposisi, atau penguncian rasio.</p>

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

        <div className="product-tag-manager">
          <label className="form-label">Tag Game Bergambar <span className="field-hint">(berbeda dari kategori)</span></label>
          <div className="product-tag-selected">
            {selectedTagIds.length ? selectedTagIds.map((tagId) => {
              const tag = gameTags.find((item) => item.id === tagId);
              if (!tag) return null;
              return (
                <button type="button" className="product-tag-chip is-selected" key={tag.id} onClick={() => toggleTag(tag.id)}>
                  <img src={tag.image_url} alt="" />
                  <span>{tag.name}</span>
                  <b aria-hidden="true">×</b>
                </button>
              );
            }) : <span className="field-hint">Belum ada tag game dipilih.</span>}
          </div>
          <div className="product-tag-options">
            {gameTags.filter((tag) => !selectedTagIds.includes(tag.id)).map((tag) => (
              <button type="button" className="product-tag-chip" key={tag.id} onClick={() => toggleTag(tag.id)}>
                <img src={tag.image_url} alt="" />
                <span>{tag.name}</span>
              </button>
            ))}
          </div>
          {isOwner ? (
            <div className="product-tag-create-row">
              <input value={tagName} onChange={(e) => setTagName(e.target.value)} placeholder="Nama tag, contoh Mobile Legends" />
              <label className="product-tag-file-btn">
                {tagImageFile ? "Gambar siap" : "Pilih gambar"}
                <input type="file" accept="image/*" onChange={pickTagImage} hidden />
              </label>
              <button type="button" className="btn btn-outline" onClick={createGameTag} disabled={tagUploading}>
                {tagUploading ? "..." : "Tambah tag"}
              </button>
            </div>
          ) : (
            <p className="field-hint">Seller hanya dapat memilih tag yang sudah dibuat Owner.</p>
          )}
        </div>

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
