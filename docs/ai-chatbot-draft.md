# Draf Chatbot AI Storichi

**Status:** Rancangan awal — belum diaktifkan di production.

## 1. Tujuan

Chatbot AI Storichi akan menjadi asisten pencarian dan pendamping transaksi yang membantu pembeli menemukan produk secara cepat, membantu penjual mengelola pertanyaan calon pembeli, serta memberi jawaban yang bersumber dari data produk dan aturan Storichi. Chatbot tidak boleh mengambil alih keputusan transaksi, memindahkan dana, mengubah status Rekber, atau menjanjikan keamanan di luar fitur resmi Storichi.

## 2. Skenario pembeli

Pembeli dapat menulis permintaan dengan bahasa sehari-hari, misalnya: “Tampilkan lima produk game yang paling murah, rating tertinggi, stok tersedia, dan seller verified.” AI mengubah permintaan tersebut menjadi filter terstruktur, lalu menampilkan maksimal lima kartu produk di dalam jendela chat AI. Setiap kartu berisi gambar, nama produk, harga, rating, nama toko, badge role seller, stok, dan tombol **Buka produk** atau **Kirim ke chat**.

Contoh permintaan yang perlu didukung:

| Permintaan | Hasil yang diharapkan |
|---|---|
| “Cari akun game RPG di bawah Rp100.000” | Filter kategori/tag game dan batas harga. |
| “Tampilkan lima produk paling populer” | Urutkan berdasarkan sinyal popularitas yang tersedia, termasuk kunjungan, wishlist, rating, dan penjualan. |
| “Cari seller verified yang punya stok” | Filter role seller, status verified, dan stok lebih dari nol. |
| “Bandingkan tiga produk ini” | Menampilkan perbandingan harga, rating produk, kunjungan, stok, dan informasi toko. |
| “Saya ingin membeli produk ini” | Membuka detail produk atau mengarahkan pengguna ke alur chat resmi; AI tidak membuat transaksi diam-diam. |

## 3. Skenario penjual

Penjual dapat memakai mode asisten seller untuk membuat ringkasan produk, menjawab pertanyaan umum berdasarkan deskripsi dan atribut produk, memeriksa produk yang stoknya rendah, serta mendapatkan saran perbaikan judul dan deskripsi. AI harus meminta konfirmasi sebelum menyimpan perubahan apa pun. AI tidak boleh mengubah harga, stok, status aktif, rating, atau data transaksi tanpa tindakan eksplisit dan otorisasi penjual.

## 4. Konteks chat AI

Jendela AI dirancang seperti panel chat yang nyaman di HP: tombol AI mengambang tidak menutupi input chat utama, panel dapat dibuka dari beranda, pencarian, detail produk, dan halaman toko, dan kartu produk dapat diketuk untuk membuka detail. Panel mendukung pertanyaan lanjutan seperti “yang lebih murah”, “khusus seller verified”, atau “urutkan A–Z” tanpa pengguna mengulangi filter sebelumnya.

Setiap jawaban hasil pencarian harus memiliki label konteks, misalnya **Berdasarkan katalog Storichi**, dan waktu pembaruan data. Jika data tidak cukup, AI harus menyatakan keterbatasannya dan menawarkan filter yang tersedia, bukan mengarang produk, harga, stok, rating, atau kebijakan.

## 5. Keamanan dan penyalahgunaan

AI harus menggunakan allowlist aksi. Aksi yang diperbolehkan pada tahap awal hanya membaca katalog publik, membaca informasi toko publik, menyusun filter pencarian, dan membuka halaman resmi Storichi. Aksi yang memerlukan konfirmasi adalah mengirim kartu ke chat, menyimpan draf deskripsi, atau membuat perubahan pada produk. Aksi yang dilarang adalah meminta password atau PIN, mengambil alih akun, mengubah rating, memanipulasi wishlist/kunjungan, melewati persetujuan Rekber, memproses pembayaran, dan memberi nasihat hukum atau finansial yang diposisikan sebagai kepastian.

Moderasi input dan output harus mendeteksi vulgarisme, penipuan, permintaan kredensial, ajakan transaksi di luar Storichi, spam, dan upaya memanipulasi rating. Kasus berisiko tinggi diarahkan ke bantuan manusia atau laporan penyalahgunaan.

## 6. Rancangan teknis awal

Tahap implementasi sebaiknya menggunakan endpoint server-side agar kunci layanan AI tidak pernah dikirim ke browser. Server menerima pesan, identitas pengguna, halaman asal, dan filter yang tersedia. Untuk pencarian produk, server lebih dahulu menjalankan query Supabase yang tervalidasi, kemudian AI hanya menyusun respons dari hasil query tersebut. Dengan cara ini AI tidak dapat mengarang hasil katalog.

Format internal hasil pencarian:

```json
{
  "intent": "product_search",
  "filters": {
    "query": "akun game RPG",
    "max_price": 100000,
    "seller_badge": "verified",
    "stock_only": true,
    "sort": "price_asc",
    "limit": 5
  },
  "product_ids": [],
  "needs_confirmation": false
}
```

Riwayat percakapan perlu dibatasi dan tidak boleh menyimpan data sensitif. Profil, pesan chat pribadi, PIN Owner, isi Rekber, dan data pembayaran tidak boleh dimasukkan ke konteks AI kecuali fitur terpisah sudah memiliki izin, masking, audit log, dan kebijakan akses yang jelas.

## 7. Tahapan pengerjaan

1. **Tahap pertama:** chatbot katalog publik dengan filter produk, kartu hasil, dan tombol buka detail.
2. **Tahap kedua:** rekomendasi personalisasi berdasarkan pencarian, wishlist, kunjungan, dan pembelian dengan pilihan untuk mematikan personalisasi.
3. **Tahap ketiga:** mode seller untuk draf deskripsi, FAQ produk, dan stok rendah dengan konfirmasi sebelum menyimpan.
4. **Tahap keempat:** moderasi AI untuk chat dan laporan penyalahgunaan dengan fallback aturan deterministik.
5. **Tahap kelima:** evaluasi akurasi, latency, biaya, privasi, audit log, serta uji dengan akun pembeli dan penjual sebelum rilis luas.

## 8. Keputusan yang masih perlu dikonfirmasi

Sebelum chatbot dibuat, perlu ditentukan apakah chatbot hanya berada di beranda dan pencarian atau juga muncul di detail produk dan halaman toko. Perlu ditentukan juga apakah rekomendasi personalisasi boleh menggunakan riwayat pembelian, serta apakah mode seller hanya untuk Owner dan seller terverifikasi atau untuk semua seller.
