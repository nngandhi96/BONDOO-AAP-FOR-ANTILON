
-- Helper to check if either user has blocked the other
CREATE OR REPLACE FUNCTION public.is_blocked_between(_a uuid, _b uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_blocks
    WHERE (blocker_id = _a AND blocked_id = _b)
       OR (blocker_id = _b AND blocked_id = _a)
  )
$$;

GRANT EXECUTE ON FUNCTION public.is_blocked_between(uuid, uuid) TO authenticated;

-- Enforce blocks on messages: sender cannot insert if blocked with the other participant
DROP POLICY IF EXISTS "Block-aware message insert" ON public.messages;
CREATE POLICY "Block-aware message insert" ON public.messages
FOR INSERT TO authenticated
WITH CHECK (
  sender_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = conversation_id
      AND (c.user_a = auth.uid() OR c.user_b = auth.uid())
      AND NOT public.is_blocked_between(c.user_a, c.user_b)
  )
);

-- Enforce blocks on conversations: cannot start a new conversation if blocked
DROP POLICY IF EXISTS "Block-aware conversation insert" ON public.conversations;
CREATE POLICY "Block-aware conversation insert" ON public.conversations
FOR INSERT TO authenticated
WITH CHECK (
  (auth.uid() = user_a OR auth.uid() = user_b)
  AND NOT public.is_blocked_between(user_a, user_b)
);

-- Enforce blocks on connection requests
DROP POLICY IF EXISTS "Block-aware connection insert" ON public.connections;
CREATE POLICY "Block-aware connection insert" ON public.connections
FOR INSERT TO authenticated
WITH CHECK (
  requester_id = auth.uid()
  AND NOT public.is_blocked_between(requester_id, recipient_id)
);

-- Drop older permissive insert policies that don't check blocks, if they exist.
-- Keep names in sync with existing policies to avoid duplicates letting inserts through.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('messages','conversations','connections')
      AND cmd = 'INSERT'
      AND policyname NOT LIKE 'Block-aware%'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- Allow moderators/admins to view all role assignments (visibility only; no write policies added)
DROP POLICY IF EXISTS "Admins and moderators can view all roles" ON public.user_roles;
CREATE POLICY "Admins and moderators can view all roles" ON public.user_roles
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'moderator'::app_role)
);
