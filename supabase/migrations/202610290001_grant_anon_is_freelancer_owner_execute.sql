-- Allow the public category explorer to evaluate the existing services RLS policy.
-- The helper only checks auth.uid() ownership; anonymous callers have no user id.
grant execute on function public.is_freelancer_owner(uuid) to anon;
