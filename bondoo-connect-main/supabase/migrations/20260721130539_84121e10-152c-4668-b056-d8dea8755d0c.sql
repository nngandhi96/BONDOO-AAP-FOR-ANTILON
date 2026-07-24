
-- 1) Restrict avatars SELECT policy to owner's own folder
DROP POLICY IF EXISTS "Authenticated can read avatars" ON storage.objects;

CREATE POLICY "Users can read their own avatars"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- 2) Revoke direct EXECUTE on SECURITY DEFINER trigger-only functions.
--    Triggers still fire regardless of role EXECUTE grants.
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bump_conversation_last_message() FROM PUBLIC, anon, authenticated;
