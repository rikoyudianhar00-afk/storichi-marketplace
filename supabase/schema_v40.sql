-- Storichi Marketplace schema v40
-- Public Midman rating summary/list access for user shop pages.
-- Run after schema_v39.sql.

alter table public.rekber_third_party_reviews enable row level security;

drop policy if exists "Peserta dapat melihat rating pihak ketiga" on public.rekber_third_party_reviews;
drop policy if exists "Public can read Midman reviews" on public.rekber_third_party_reviews;
create policy "Public can read Midman reviews" on public.rekber_third_party_reviews
  for select using (true);

create index if not exists rekber_third_party_reviews_public_idx
  on public.rekber_third_party_reviews(third_party_id, created_at desc);
