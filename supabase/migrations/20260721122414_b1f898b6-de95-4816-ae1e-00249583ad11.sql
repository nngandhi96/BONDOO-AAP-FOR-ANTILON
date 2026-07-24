
CREATE TABLE public.meetups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  proposer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  place TEXT NOT NULL,
  address TEXT,
  scheduled_at TIMESTAMPTZ NOT NULL,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT meetups_status_check CHECK (status IN ('pending','confirmed','declined','cancelled')),
  CONSTRAINT meetups_distinct_users CHECK (proposer_id <> recipient_id)
);

CREATE INDEX meetups_conversation_idx ON public.meetups(conversation_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.meetups TO authenticated;
GRANT ALL ON public.meetups TO service_role;

ALTER TABLE public.meetups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants can view meetups"
ON public.meetups FOR SELECT
TO authenticated
USING (auth.uid() = proposer_id OR auth.uid() = recipient_id);

CREATE POLICY "Proposer can create meetup"
ON public.meetups FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = proposer_id
  AND EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = conversation_id
      AND (
        (c.user_a = proposer_id AND c.user_b = recipient_id)
        OR (c.user_b = proposer_id AND c.user_a = recipient_id)
      )
  )
);

CREATE POLICY "Participants can update meetup"
ON public.meetups FOR UPDATE
TO authenticated
USING (auth.uid() = proposer_id OR auth.uid() = recipient_id)
WITH CHECK (auth.uid() = proposer_id OR auth.uid() = recipient_id);

CREATE TRIGGER meetups_set_updated_at
BEFORE UPDATE ON public.meetups
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
