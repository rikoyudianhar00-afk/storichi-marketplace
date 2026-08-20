import { useState } from "react";

function encoded(value) { return encodeURIComponent(value); }

export default function ProductShareMenu({ product }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const url = typeof window !== "undefined" ? `${window.location.origin}/produk/${product.slug}` : `/produk/${product.slug}`;
  const text = `Lihat ${product.name} di Storichi`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt("Salin link produk ini:", url);
    }
  }

  async function nativeShare() {
    if (navigator.share) {
      await navigator.share({ title: product.name, text, url });
      return;
    }
    await copyLink();
  }

  const links = [
    { label: "WhatsApp", href: `https://wa.me/?text=${encoded(`${text} ${url}`)}` },
    { label: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${encoded(url)}` },
    { label: "X", href: `https://twitter.com/intent/tweet?text=${encoded(text)}&url=${encoded(url)}` },
    { label: "Threads", href: `https://www.threads.net/intent/post?text=${encoded(`${text} ${url}`)}` },
    { label: "Instagram", onClick: nativeShare },
  ];

  return (
    <div className="product-share-wrap">
      <button type="button" className="product-share-button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-label="Bagikan produk">↗ <span>Bagikan</span></button>
      {open && (
        <div className="product-share-menu">
          <strong>Bagikan produk</strong>
          <div className="product-share-grid">
            {links.map((item) => item.href ? <a key={item.label} href={item.href} target="_blank" rel="noreferrer" onClick={() => setOpen(false)}>{item.label}</a> : <button key={item.label} type="button" onClick={() => { item.onClick(); setOpen(false); }}>{item.label}</button>)}
            <button type="button" onClick={copyLink}>{copied ? "Tersalin" : "Copy link"}</button>
          </div>
        </div>
      )}
    </div>
  );
}
