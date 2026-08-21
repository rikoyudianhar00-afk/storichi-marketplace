import RoleBadge from "../components/RoleBadge";

const SAMPLE = {
  buyer: { is_seller: false, is_verified: false, is_midman: false, is_owner: false },
  seller: { is_seller: true, is_verified: false, is_midman: false, is_owner: false },
  verified: { is_seller: true, is_verified: true, is_midman: false, is_owner: false },
  midman: { is_seller: false, is_verified: false, is_midman: true, is_owner: false },
  owner: { is_seller: false, is_verified: false, is_midman: false, is_owner: true },
};

export default function InfoHelp() {
  return (
    <main className="container" style={{ paddingBottom: 40 }}>
      <h1 className="page-title">Cara Menggunakan Storichi</h1>
      <p className="page-subtitle">Panduan singkat semua fitur dan arti setiap tanda di akun pengguna.</p>

      <section className="info-section">
        <h2>Menjual Produk</h2>
        <ol>
          <li>Buka menu (☰) → <strong>Jual Produk</strong>.</li>
          <li>Isi judul, kategori, harga, stok, deskripsi, dan unggah foto produk.</li>
          <li>Tap <strong>Terbitkan Produk</strong> — produk langsung tampil di beranda dan kategori terkait.</li>
          <li>Kelola produk (edit/hapus) lewat <strong>Akun → Produk Saya</strong>.</li>
        </ol>
      </section>

      <section className="info-section">
        <h2>Membeli Produk</h2>
        <ol>
          <li>Buka halaman produk yang diinginkan, tap <strong>Saya Mau Beli</strong>.</li>
          <li>Kamu otomatis diarahkan ke Chat dengan Seller, berisi permintaan beli.</li>
          <li>Tunggu Seller <strong>menyetujui</strong> atau menolak permintaan tersebut.</li>
          <li>Setelah disetujui, Seller dapat memilih Midman (MM) dan mengirim undangan dari chat transaksi itu.</li>
        </ol>
      </section>

      <section className="info-section">
        <h2>Grup Rekber (Rekening Bersama)</h2>
        <p>
          Rekber berjalan di chat transaksi yang sama setelah Seller menyetujui permintaan beli dan Midman (MM) menerima undangan.
        </p>
        <ol>
          <li>Di dalam chat transaksi, Buyer, Seller, dan Midman (MM) dapat berkomunikasi sesuai aksesnya.</li>
          <li>Seller dapat <strong>invite</strong> Midman (MM) melalui notifikasi Rekber.</li>
          <li>Midman (MM) mengaktifkan Rekening Bersama, mengamankan dana/item, lalu Buyer dan Seller memberikan persetujuan serta rating.</li>
          <li>Rekber dapat <strong>dibatalkan</strong> jika transaksi tidak jadi.</li>
        </ol>
      </section>

      <section className="info-section">
        <h2>Chat</h2>
        <p>
          Setiap percakapan terhubung ke satu produk. Kamu bisa mengirim pesan teks maupun
          gambar/video lewat ikon lampiran di sebelah kolom pesan.
        </p>
      </section>

      <section className="info-section">
        <h2>Arti Tanda di Profil</h2>
        <p>Setiap pengguna bisa punya lebih dari satu tanda sekaligus.</p>

        <div className="role-info-list">
          <div className="role-info-item">
            <RoleBadge profile={SAMPLE.buyer} size={20} />
            <div>
              <strong>Buyer</strong>
              <p>Tanda default untuk pengguna yang belum pernah menerbitkan produk.</p>
            </div>
          </div>

          <div className="role-info-item">
            <RoleBadge profile={SAMPLE.seller} size={20} />
            <div>
              <strong>Seller</strong>
              <p>Otomatis muncul begitu pengguna menerbitkan minimal satu produk.</p>
            </div>
          </div>

          <div className="role-info-item">
            <RoleBadge profile={SAMPLE.verified} size={20} />
            <div>
              <strong>Terverifikasi (centang biru)</strong>
              <p>Diberikan langsung oleh Owner kepada Seller yang sudah terbukti terpercaya.</p>
            </div>
          </div>

          <div className="role-info-item">
            <RoleBadge profile={SAMPLE.midman} size={20} />
            <div>
              <strong>Midman (MM)</strong>
              <p>
                Penghubung transaksi yang ditunjuk oleh Owner. Tanda ini bisa muncul bersamaan
                dengan tanda lain (double tanda).
              </p>
            </div>
          </div>

          <div className="role-info-item">
            <RoleBadge profile={SAMPLE.owner} size={20} />
            <div>
              <strong>Owner (centang hitam)</strong>
              <p>Pengelola resmi Storichi. Owner dapat memberi tanda Terverifikasi dan Mid Man ke pengguna lain lewat halaman Akun.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="info-section">
        <h2>Edit Profil</h2>
        <p>
          Buka <strong>Akun</strong>, tap ikon pensil pada foto profil untuk mengganti foto, atau
          tap <strong>Edit</strong> di sebelah nama untuk mengganti nickname.
        </p>
      </section>
    </main>
  );
}
