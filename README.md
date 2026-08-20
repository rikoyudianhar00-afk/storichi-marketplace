# Storichi Marketplace

Marketplace top up game & akun dengan login Google, chat realtime, dan grup rekber sementara.

## Setup
1. Copy `.env.example` ke `.env` dan isi dengan Supabase URL + anon key.
2. `npm install`
3. `npm run dev` untuk lokal, `npm run build` untuk production.

Skema database dijalankan berurutan di Supabase SQL Editor: `schema.sql`, lalu migrasi `schema_v2.sql` sampai `schema_v9.sql`. `schema_v6.sql` mengaktifkan grup kategori, metrik like/view/top sales, dan notifikasi chat. `schema_v7.sql` menambahkan bio seller, lobby Rekber 3 pihak, workflow custody dana/item oleh midman, serta moderasi pesan di database. `schema_v8.sql` menambahkan penyimpanan subscription Web Push. `schema_v9.sql` menambahkan banner iklan Owner dengan PIN, bucket gambar iklan, tabel follow seller, halaman toko seller, dan fondasi Discover personal.

## Notifikasi saat web ditutup
1. Buat pasangan VAPID key untuk Web Push dan isi `VITE_WEB_PUSH_PUBLIC_KEY` pada environment frontend.
2. Jalankan `supabase/schema_v8.sql`.
3. Deploy `supabase/functions/send-chat-push/index.ts` sebagai Edge Function `send-chat-push`.
4. Isi secret function `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, dan `PUSH_WEBHOOK_SECRET`.
5. Buat Database Webhook Supabase untuk `public.chat_notifications` pada event `INSERT`, arahkan ke Edge Function tersebut, dan kirim header `x-push-webhook-secret` dengan nilai yang sama.
6. Buka halaman Chat, tekan **Aktifkan notifikasi**, dan izinkan notifikasi pada browser. Push saat web ditutup membutuhkan HTTPS, izin browser, service worker, serta webhook dan Edge Function yang aktif.
