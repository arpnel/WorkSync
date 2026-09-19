-- Apply after payment write permissions are secured. Does not change existing work.
begin;
create or replace function public.worksync_require_paid_submission()
returns trigger language plpgsql security definer set search_path='' as $$
declare p public.projects; client_user uuid;
begin
  select * into p from public.projects where project_id=new.project_id for update;
  if p.project_id is null then raise exception 'Project unavailable'; end if;
  select user_id into client_user from public.client_profiles where client_id=p.client_id;
  if not exists (
    select 1 from public.payments pay
    where pay.project_id=p.project_id and pay.payer_id=client_user
      and pay.status::text='paid' and pay.amount=p.budget
      and pay.transaction_reference is not null
  ) then
    raise exception 'The client must pay the full agreed amount before work can be submitted' using errcode='42501';
  end if;
  return new;
end; $$;
revoke all on function public.worksync_require_paid_submission() from public,anon,authenticated;
drop trigger if exists worksync_require_paid_submission on public.project_submissions;
create trigger worksync_require_paid_submission before insert or update of project_id on public.project_submissions
for each row execute function public.worksync_require_paid_submission();
commit;
