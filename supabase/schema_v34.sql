-- Storichi Marketplace schema v34
-- Account recovery: neutralize stuck Rekber sessions and pending invitations.
-- Run after schema_v33.sql.

create or replace function public.neutralize_my_rekber()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  active_group_ids uuid[];
  active_request_ids uuid[];
  invitation_request_ids uuid[];
  closed_groups integer := 0;
  reset_requests integer := 0;
  removed_invitations integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Kamu harus login untuk menetralkan akun';
  end if;

  select coalesce(array_agg(g.id), '{}'::uuid[])
    into active_group_ids
  from public.rekber_groups g
  where g.status = 'active'
    and (
      g.buyer_id = auth.uid()
      or g.seller_id = auth.uid()
      or g.third_party_id = auth.uid()
      or g.midman_id = auth.uid()
    );

  select coalesce(array_agg(distinct pr.id), '{}'::uuid[])
    into active_request_ids
  from public.purchase_requests pr
  where pr.rekber_group_id = any(active_group_ids);

  select coalesce(array_agg(distinct i.purchase_request_id), '{}'::uuid[])
    into invitation_request_ids
  from public.rekber_invitations i
  where i.status in ('pending', 'buyer_approved')
    and (
      i.buyer_id = auth.uid()
      or i.seller_id = auth.uid()
      or i.third_party_id = auth.uid()
    );

  -- Preserve the normal chat as history, but make the purchase request eligible for a new request.
  if cardinality(active_request_ids) > 0 then
    update public.purchase_requests
    set rekber_group_id = null,
        status = 'rejected'
    where id = any(active_request_ids);
    get diagnostics reset_requests = row_count;
  end if;

  -- Remove Rekber-only children before deleting the stuck lobby.
  if cardinality(active_group_ids) > 0 then
    delete from public.rekber_third_party_reviews where group_id = any(active_group_ids);
    delete from public.rekber_members where group_id = any(active_group_ids);
    delete from public.rekber_messages where group_id = any(active_group_ids);
    delete from public.rekber_groups where id = any(active_group_ids);
    get diagnostics closed_groups = row_count;
  end if;

  -- Remove accepted invitations attached to the removed groups and pending invitations involving this account.
  delete from public.rekber_invitations
  where purchase_request_id = any(active_request_ids)
     or purchase_request_id = any(invitation_request_ids)
     or (
       status in ('pending', 'buyer_approved')
       and (
         buyer_id = auth.uid()
         or seller_id = auth.uid()
         or third_party_id = auth.uid()
       )
     );
  get diagnostics removed_invitations = row_count;

  return jsonb_build_object(
    'closed_groups', closed_groups,
    'reset_requests', reset_requests,
    'removed_invitations', removed_invitations
  );
end;
$$;

grant execute on function public.neutralize_my_rekber() to authenticated;
