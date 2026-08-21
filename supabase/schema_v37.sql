-- Storichi Marketplace schema v37
-- Repair live Rekber rating table drift discovered during mobile testing.
-- Run after schema_v36.sql.

alter table public.rekber_third_party_reviews
  add column if not exists purchase_request_id uuid references public.purchase_requests(id) on delete cascade,
  add column if not exists comment text;

update public.rekber_third_party_reviews review
set purchase_request_id = group_row.purchase_request_id
from public.rekber_groups group_row
where review.group_id = group_row.id
  and review.purchase_request_id is null;

create unique index if not exists rekber_third_party_reviews_group_reviewer_key
  on public.rekber_third_party_reviews(group_id, reviewer_id);

notify pgrst, 'reload schema';
