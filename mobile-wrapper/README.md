# Storichi Android Wrapper

Subproject ini adalah **wrapper Expo Android** untuk `https://storichi-marketplace.vercel.app/`. Website adalah sumber tunggal tampilan dan data; wrapper hanya menyediakan WebView, navigasi kembali Android, deep link, serta notifikasi perangkat.

## Batas notifikasi

Wrapper hanya mendaftarkan push untuk tiga peristiwa berikut:

| Peristiwa | Tujuan saat diketuk |
| --- | --- |
| Chat pelanggan baru | Thread chat terkait |
| Balasan chat | Thread chat terkait |
| Undangan Rekber | Chat transaksi atau halaman Rekber terkait |

Notifikasi Wishlist, promosi, AI, rating, dan iklan tidak dikirim.

## Menyiapkan Firebase

1. Buat aplikasi Android Firebase dengan package **`com.storichi.app`**.
2. Unduh `google-services.json` dari Firebase Console.
3. Simpan file tersebut hanya di folder ini sebagai `google-services.json`. File telah diabaikan Git dan **tidak boleh** dikomit.
4. Simpan kredensial Service Account Firebase sebagai environment variable `FIREBASE_SERVICE_ACCOUNT_JSON` pada lingkungan build/layanan yang mengirim push. Jangan tempel private key di issue, commit, atau chat.
5. Pada Supabase Dashboard, tambahkan `storichi://auth/callback` ke **Authentication → URL Configuration → Redirect URLs** supaya Google Sign-In dapat kembali ke aplikasi.

## Menjalankan source

```bash
pnpm install
pnpm check
pnpm android
```

Untuk membuat APK resmi dari workspace terkelola, buat checkpoint lalu gunakan tombol **Publish** pada UI. Jangan membangun APK dengan resource sandbox lokal.

## Perlindungan credential

`google-services.json`, file service account Firebase, environment variable, dan folder build tidak dilacak. Sebelum push, jalankan:

```bash
git check-ignore -v google-services.json
git status --short
```
