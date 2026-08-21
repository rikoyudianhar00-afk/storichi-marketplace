-- Storichi Marketplace schema v31
-- Publish Rekber invitations so buyer, seller, and third-party UIs update without refresh.
-- Jalankan setelah schema_v30.sql.

do $$
begin
  begin
    alter publication supabase_realtime add table public.rekber_invitations;
  exception when duplicate_object then
    null;
  end;
end $$;
