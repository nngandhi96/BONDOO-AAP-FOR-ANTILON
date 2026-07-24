
-- Allow users to see blocks where they are the target (needed so
-- is_blocked_between works under SECURITY INVOKER for both directions).
CREATE POLICY "Users can view blocks against them"
  ON public.user_blocks
  FOR SELECT
  USING (auth.uid() = blocked_id);

-- Switch to SECURITY INVOKER so the function runs with caller's privileges.
CREATE OR REPLACE FUNCTION public.is_blocked_between(_a uuid, _b uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_blocks
    WHERE (blocker_id = _a AND blocked_id = _b)
       OR (blocker_id = _b AND blocked_id = _a)
  )
$function$;
