
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS read_at timestamptz;
CREATE INDEX IF NOT EXISTS messages_conv_read_idx ON public.messages(conversation_id, read_at);

-- Allow the recipient (a conversation participant who is NOT the sender) to mark messages as read.
DROP POLICY IF EXISTS "recipient can mark read" ON public.messages;
CREATE POLICY "recipient can mark read" ON public.messages
FOR UPDATE
USING (
  sender_id <> auth.uid() AND EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = messages.conversation_id
      AND (c.user_a = auth.uid() OR c.user_b = auth.uid())
  )
)
WITH CHECK (
  sender_id <> auth.uid() AND EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = messages.conversation_id
      AND (c.user_a = auth.uid() OR c.user_b = auth.uid())
  )
);
