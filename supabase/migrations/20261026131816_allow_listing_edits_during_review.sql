-- Prepared migration. Allows an owner to revise a listing while it is
-- awaiting review; the existing submit RPC resets the scan and queues it again.
begin;

create or replace function public.worksync_begin_listing_edit(p_kind text,p_listing uuid)
returns void language plpgsql security definer set search_path='' as $$
declare submission public.listing_submissions;
begin
 if p_kind not in ('job','service') then raise exception 'Invalid listing type'; end if;
 select * into submission from public.listing_submissions
 where listing_type=p_kind and listing_id=p_listing for update;
 if not found or submission.owner_id is distinct from auth.uid() then raise exception 'Listing owner required'; end if;
 if submission.status not in ('approved','rejected','pending_review','manual_review','editing') then
  raise exception 'This listing cannot be edited in its current state';
 end if;
 if submission.status<>'editing' then
  update public.listing_submissions set status='editing' where submission_id=submission.submission_id;
 end if;
end; $$;

commit;
