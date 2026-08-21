-- Storichi Marketplace schema v30
-- Align invitation status constraint with the buyer approval workflow.
-- Jalankan setelah schema_v29.sql.

alter table public.rekber_invitations
drop constraint if exists rekber_invitations_status_check;

alter table public.rekber_invitations
add constraint rekber_invitations_status_check
check (status in ('pending', 'buyer_approved', 'accepted', 'declined', 'expired'));
