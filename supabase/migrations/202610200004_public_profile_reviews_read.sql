-- PREPARED, NOT APPLIED. Profile reviews are visible to signed-in users,
-- including viewers who were not participants in the reviewed project.
-- The existing reviews_read policy restricts rows to project participants,
-- which prevents other users from seeing reviews on public profiles.
begin;

drop policy if exists reviews_read on public.reviews;
create policy reviews_read
  on public.reviews
  for select
  to authenticated
  using (true);

commit;
