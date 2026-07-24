
CREATE TABLE public.meetup_acknowledgements (
  meetup_id UUID NOT NULL REFERENCES public.meetups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (meetup_id, user_id)
);

GRANT SELECT, INSERT ON public.meetup_acknowledgements TO authenticated;
GRANT ALL ON public.meetup_acknowledgements TO service_role;

ALTER TABLE public.meetup_acknowledgements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants can view acknowledgements"
  ON public.meetup_acknowledgements FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.meetups m
      WHERE m.id = meetup_id
        AND (m.proposer_id = auth.uid() OR m.recipient_id = auth.uid())
    )
  );

CREATE POLICY "Users can insert their own acknowledgement"
  ON public.meetup_acknowledgements FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.meetups m
      WHERE m.id = meetup_id
        AND (m.proposer_id = auth.uid() OR m.recipient_id = auth.uid())
    )
  );
