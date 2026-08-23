-- Storichi Marketplace schema v44
-- Reviewers only see their own rating lock; a Midman sees locks issued for that Midman.

drop policy if exists "Rekber participants can view Midman rating locks" on public.rekber_third_party_rating_locks;

create policy "Reviewer or Midman can view Midman rating locks"
on public.rekber_third_party_rating_locks
for select
to authenticated
using (auth.uid() = reviewer_id or auth.uid() = third_party_id);

notify pgrst, 'reload schema';
