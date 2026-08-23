-- Storichi Marketplace schema v43
-- Participants only need lock existence to avoid prompting repeated MM ratings.

create policy "Rekber participants can view Midman rating locks"
on public.rekber_third_party_rating_locks
for select
to authenticated
using (
  auth.uid() = reviewer_id
  or exists (
    select 1
    from public.rekber_groups group_row
    where group_row.third_party_id = rekber_third_party_rating_locks.third_party_id
      and auth.uid() in (group_row.buyer_id, group_row.seller_id, group_row.third_party_id)
  )
);

alter publication supabase_realtime add table public.rekber_third_party_rating_locks;

notify pgrst, 'reload schema';
