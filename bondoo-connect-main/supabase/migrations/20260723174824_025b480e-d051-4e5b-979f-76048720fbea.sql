
-- Attachment fields on messages
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS attachment_path text,
  ADD COLUMN IF NOT EXISTS attachment_type text,
  ADD COLUMN IF NOT EXISTS attachment_name text;

-- Allow empty body when an attachment is present
ALTER TABLE public.messages ALTER COLUMN body DROP NOT NULL;
ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_body_or_attachment_check;
ALTER TABLE public.messages
  ADD CONSTRAINT messages_body_or_attachment_check
  CHECK (
    (body IS NOT NULL AND length(btrim(body)) > 0)
    OR attachment_path IS NOT NULL
  );

-- Helper: is the current user a participant of a conversation?
CREATE OR REPLACE FUNCTION public.is_conversation_participant(_conversation_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversations
    WHERE id = _conversation_id
      AND (user_a = _user_id OR user_b = _user_id)
  )
$$;

REVOKE ALL ON FUNCTION public.is_conversation_participant(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_conversation_participant(uuid, uuid) TO authenticated;

-- Storage policies for chat-attachments bucket.
-- Path convention: {conversationId}/{userId}/{timestamp}.{ext}
DROP POLICY IF EXISTS "chat attachments: participants can read" ON storage.objects;
CREATE POLICY "chat attachments: participants can read"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'chat-attachments'
  AND public.is_conversation_participant(
    ((storage.foldername(name))[1])::uuid,
    auth.uid()
  )
);

DROP POLICY IF EXISTS "chat attachments: participants can upload" ON storage.objects;
CREATE POLICY "chat attachments: participants can upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'chat-attachments'
  AND (storage.foldername(name))[2] = auth.uid()::text
  AND public.is_conversation_participant(
    ((storage.foldername(name))[1])::uuid,
    auth.uid()
  )
);

DROP POLICY IF EXISTS "chat attachments: owners can delete" ON storage.objects;
CREATE POLICY "chat attachments: owners can delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'chat-attachments'
  AND (storage.foldername(name))[2] = auth.uid()::text
);
