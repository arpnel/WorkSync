-- PREPARED, NOT APPLIED.
-- Premium support requests enter the high-priority support queue.
-- Requires the support-ticket and subscription-plan migrations.
begin;

create or replace function public.worksync_submit_support_ticket(
  p_category text, p_subject text, p_description text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  ticket uuid;
  support_priority text;
begin
  if auth.uid() is null then raise exception 'Sign in to submit a support ticket'; end if;
  if p_category not in ('Account','Payments','Projects','Technical issue','Safety concern','Other') then
    raise exception 'Choose a valid category';
  end if;
  if length(trim(p_subject)) not between 4 and 120 then
    raise exception 'Subject must be between 4 and 120 characters';
  end if;
  if length(trim(p_description)) not between 20 and 4000 then
    raise exception 'Details must be between 20 and 4000 characters';
  end if;
  support_priority := case
    when public.worksync_effective_subscription_plan(auth.uid()) = 'pro' then 'high'
    else 'normal'
  end;
  insert into public.support_tickets(requester_id,category,subject,description,priority)
  values(auth.uid(),p_category,trim(p_subject),trim(p_description),support_priority)
  returning ticket_id into ticket;
  return ticket;
end;
$$;
revoke all on function public.worksync_submit_support_ticket(text,text,text)
  from public, anon;
grant execute on function public.worksync_submit_support_ticket(text,text,text)
  to authenticated;

commit;
