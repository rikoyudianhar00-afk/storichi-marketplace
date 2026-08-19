# Storichi Marketplace

Marketplace top up game & akun dengan login Google, chat realtime, dan grup rekber sementara.

## Setup
1. Copy `.env.example` ke `.env` dan isi dengan Supabase URL + anon key.
2. `npm install`
3. `npm run dev` untuk lokal, `npm run build` untuk production.

Skema database dijalankan berurutan di Supabase SQL Editor: `schema.sql`, lalu migrasi `schema_v2.sql` sampai `schema_v6.sql`. Migrasi `schema_v6.sql` mengaktifkan grup kategori, metrik like/view/top sales, dan notifikasi chat realtime.
