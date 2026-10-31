-- Prepared only; not applied. This adds a database-level guard to the existing
-- worksync_leave_review RPC path without replacing its authorization logic.
do $$
begin
  if to_regclass('public.reviews') is null then
    raise exception 'Expected public.reviews table is missing';
  end if;
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'reviews'
      and column_name = 'comment'
      and data_type in ('text', 'character varying')
  ) then
    raise exception 'Expected text column public.reviews.comment is missing';
  end if;
end;
$$;

create or replace function public.worksync_reject_review_profanity()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  normalized text;
begin
  normalized := regexp_replace(
    translate(
      lower(regexp_replace(coalesce(to_jsonb(new) ->> 'comment', ''), 'f@ck', 'fuck', 'gi')),
      '013!|@457$',
      'oieiiaasts'
    ),
    '[^a-z[:space:]]',
    '',
    'g'
  );

  if exists (
    select 1
    from regexp_split_to_table(normalized, '[[:space:]]+') as terms(token)
    where token = any (array[
      'arsehole', 'asshole', 'bastard', 'bitch', 'bobo', 'bwisit', 'bullshit',
      'crap', 'cunt', 'dick', 'dickhead', 'fuck', 'fucker', 'fucking',
      'motherfucker', 'motherfucking', 'shit', 'shitty', 'slut', 'prick',
      'twat', 'wanker', 'whore', 'gago', 'gaga', 'inutil', 'leche', 'pakshet',
      'punyeta', 'tanga', 'putangina', 'putanginamo', 'puta', 'tangina',
      'tanginamo', 'tarantado', 'ulol'
    ]::text[])
  ) or normalized ~ '(^|[[:space:]])putang[[:space:]]+ina([[:space:]]|$)' then
    raise exception using
      errcode = '22023',
      message = 'Please remove profanity or offensive language before submitting your review.';
  end if;
  return new;
end;
$$;

revoke all on function public.worksync_reject_review_profanity() from public, anon;
grant execute on function public.worksync_reject_review_profanity() to authenticated, service_role;

drop trigger if exists worksync_reject_review_profanity on public.reviews;
create trigger worksync_reject_review_profanity
before insert or update of comment on public.reviews
for each row execute function public.worksync_reject_review_profanity();
