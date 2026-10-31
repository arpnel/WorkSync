-- Prepared only: disable saved client opt-ins and prevent the removed setting
-- from being enabled again through the old RPC. The settlement worker still
-- applies the existing review deadlines to submitted deliveries.
begin;

update public.project_payment_preferences
set auto_accept = false,
    enabled_at = null,
    updated_at = now()
where auto_accept is distinct from false
   or enabled_at is not null;

revoke all on function public.worksync_set_auto_accept(uuid, boolean)
  from public, anon, authenticated;

commit;
