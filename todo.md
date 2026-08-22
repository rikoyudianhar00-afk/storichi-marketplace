# Project TODO

- [x] Audit konfigurasi endpoint AI Vercel dan penyebab fallback lokal.
- [ ] Konfigurasikan kredensial model AI sebagai secret server-side Vercel.
- [x] Hubungkan AI Buyer/Seller ke model generatif asli dengan konteks katalog terbatas.
- [x] Hapus respons fallback berulang pada panel AI dan tampilkan status koneksi yang jelas.
- [x] Uji respons bebas, rekomendasi katalog, guardrails, dan batas tindakan AI.
- [x] Push perbaikan AI website ke branch deployment.
- [x] Hapus pemilih Buyer/Seller dan gunakan satu percakapan AI yang memahami maksud pengguna dari teksnya.
- [x] Tambahkan tombol speech-to-text browser, status rekaman/transkripsi, dan jawaban text-to-speech pada Asisten Storichi.
- [ ] Uji alur suara di Chrome Android serta fallback teks pada browser yang tidak mendukung pengenalan suara.
- [x] Uji endpoint AI generatif production setelah environment variable Vercel diaktifkan dan perbaiki bug yang ditemukan.
- [x] Sesuaikan gateway AI ke format Google Generative API untuk Gemini Flash Lite tanpa mengubah variable pengguna.
- [x] Hapus seluruh input suara, text-to-speech, status suara, dan tombol mikrofon dari Asisten Storichi.
- [x] Perluas konteks AI ke katalog aktif dan toko yang informasinya bersifat publik tanpa mengirim data privat pengguna.
- [x] Uji pencarian AI lintas produk dan toko publik serta pastikan kartu hasil dapat dibuka dengan benar.
- [ ] Perbaiki regresi Asisten yang menyatakan katalog kosong meskipun produk publik tersedia di beranda.
- [ ] Ambil katalog aktif dan toko publik langsung di gateway server agar konteks Gemini tidak bergantung pada pemuatan browser.
- [ ] Uji production menggunakan data publik database Storichi yang sebenarnya.
