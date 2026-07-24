
-- 1. Profiles: interests + home location
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS interests text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS home_city text,
  ADD COLUMN IF NOT EXISTS home_lat double precision,
  ADD COLUMN IF NOT EXISTS home_lng double precision;

-- 2. Reviews table (post-meetup ratings)
CREATE TABLE IF NOT EXISTS public.reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meetup_id uuid NOT NULL REFERENCES public.meetups(id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL,
  reviewee_id uuid NOT NULL,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(meetup_id, reviewer_id)
);

GRANT SELECT, INSERT ON public.reviews TO authenticated;
GRANT ALL ON public.reviews TO service_role;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view reviews about themselves or by themselves"
  ON public.reviews FOR SELECT TO authenticated
  USING (auth.uid() = reviewer_id OR auth.uid() = reviewee_id);

CREATE POLICY "Users can create reviews for their own meetups"
  ON public.reviews FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = reviewer_id
    AND reviewer_id <> reviewee_id
    AND EXISTS (
      SELECT 1 FROM public.meetups m
      WHERE m.id = meetup_id
        AND m.status = 'confirmed'
        AND (m.proposer_id = auth.uid() OR m.recipient_id = auth.uid())
        AND (m.proposer_id = reviewee_id OR m.recipient_id = reviewee_id)
    )
  );

-- Bump reviewee's community_reviews_count + attended_meets_count on new review
CREATE OR REPLACE FUNCTION public.bump_reviewee_stats()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.profiles
    SET community_reviews_count = community_reviews_count + 1,
        attended_meets_count = attended_meets_count + 1
    WHERE id = NEW.reviewee_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bump_reviewee_stats ON public.reviews;
CREATE TRIGGER trg_bump_reviewee_stats
  AFTER INSERT ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.bump_reviewee_stats();

-- 3. Notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  link text,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON public.notifications(user_id, created_at DESC);

GRANT SELECT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own notifications"
  ON public.notifications FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own notifications"
  ON public.notifications FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own notifications"
  ON public.notifications FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- 4. Auto-notify on new message
CREATE OR REPLACE FUNCTION public.notify_on_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  recipient uuid;
  sender_name text;
BEGIN
  SELECT CASE WHEN user_a = NEW.sender_id THEN user_b ELSE user_a END
    INTO recipient
    FROM public.conversations WHERE id = NEW.conversation_id;
  IF recipient IS NULL THEN RETURN NEW; END IF;
  SELECT display_name INTO sender_name FROM public.profiles WHERE id = NEW.sender_id;
  INSERT INTO public.notifications(user_id, type, title, body, link)
  VALUES (
    recipient,
    'message',
    COALESCE(sender_name, 'Someone') || ' sent you a message',
    LEFT(NEW.body, 120),
    '/messages/' || NEW.conversation_id::text
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_on_message ON public.messages;
CREATE TRIGGER trg_notify_on_message
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_message();

-- 5. Auto-notify on connection request / accept
CREATE OR REPLACE FUNCTION public.notify_on_connection()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  actor_name text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT display_name INTO actor_name FROM public.profiles WHERE id = NEW.requester_id;
    INSERT INTO public.notifications(user_id, type, title, body, link)
    VALUES (NEW.recipient_id, 'connection_request',
      COALESCE(actor_name, 'Someone') || ' wants to connect',
      'Review the request in your inbox', '/requests');
  ELSIF TG_OP = 'UPDATE' AND OLD.status <> NEW.status AND NEW.status = 'accepted' THEN
    SELECT display_name INTO actor_name FROM public.profiles WHERE id = NEW.recipient_id;
    INSERT INTO public.notifications(user_id, type, title, body, link)
    VALUES (NEW.requester_id, 'connection_accepted',
      COALESCE(actor_name, 'Someone') || ' accepted your request',
      'You can now start chatting', '/messages');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_on_connection ON public.connections;
CREATE TRIGGER trg_notify_on_connection
  AFTER INSERT OR UPDATE ON public.connections
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_connection();

-- 6. Auto-notify on meetup proposal / confirm
CREATE OR REPLACE FUNCTION public.notify_on_meetup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  actor_name text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT display_name INTO actor_name FROM public.profiles WHERE id = NEW.proposer_id;
    INSERT INTO public.notifications(user_id, type, title, body, link)
    VALUES (NEW.recipient_id, 'meetup_proposal',
      COALESCE(actor_name, 'Someone') || ' proposed a meetup',
      NEW.place, '/meetup/' || NEW.id::text);
  ELSIF TG_OP = 'UPDATE' AND OLD.status <> NEW.status THEN
    IF NEW.status = 'confirmed' THEN
      SELECT display_name INTO actor_name FROM public.profiles WHERE id = NEW.recipient_id;
      INSERT INTO public.notifications(user_id, type, title, body, link)
      VALUES (NEW.proposer_id, 'meetup_confirmed',
        COALESCE(actor_name, 'Someone') || ' confirmed the meetup',
        NEW.place, '/meetup/' || NEW.id::text);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_on_meetup ON public.meetups;
CREATE TRIGGER trg_notify_on_meetup
  AFTER INSERT OR UPDATE ON public.meetups
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_meetup();
