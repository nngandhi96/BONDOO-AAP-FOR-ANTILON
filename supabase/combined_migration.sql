-- Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT '',
  pronouns TEXT NOT NULL DEFAULT '',
  neighbourhood TEXT NOT NULL DEFAULT '',
  bio TEXT NOT NULL DEFAULT '',
  phone_verified BOOLEAN NOT NULL DEFAULT false,
  gov_id_verified BOOLEAN NOT NULL DEFAULT false,
  selfie_verified BOOLEAN NOT NULL DEFAULT false,
  background_check_status TEXT NOT NULL DEFAULT 'pending' CHECK (background_check_status IN ('pending','approved','failed')),
  community_reviews_count INTEGER NOT NULL DEFAULT 0 CHECK (community_reviews_count >= 0),
  attended_meets_count INTEGER NOT NULL DEFAULT 0 CHECK (attended_meets_count >= 0),
  trust_score INTEGER GENERATED ALWAYS AS (
    (CASE WHEN phone_verified THEN 20 ELSE 0 END) +
    (CASE WHEN gov_id_verified THEN 25 ELSE 0 END) +
    (CASE WHEN selfie_verified THEN 15 ELSE 0 END) +
    LEAST(community_reviews_count * 3, 18) +
    LEAST(attended_meets_count * 2, 14) +
    (CASE WHEN background_check_status = 'approved' THEN 8 ELSE 0 END)
  ) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Signed-in users can view any profile (needed later for activity host cards)
CREATE POLICY "authenticated can view profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

-- Only owner can update their own row
CREATE POLICY "user can update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Insert allowed for owner (trigger handles it too; policy required for safety)
CREATE POLICY "user can insert own profile"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_set_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Lock protected fields from client-side updates.
-- Users can only change display_name, pronouns, neighbourhood, bio.
-- Verification flags and counters can only be changed by service_role (bypasses RLS + this trigger).
CREATE OR REPLACE FUNCTION public.protect_profile_trust_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.phone_verified          := OLD.phone_verified;
  NEW.gov_id_verified         := OLD.gov_id_verified;
  NEW.selfie_verified         := OLD.selfie_verified;
  NEW.background_check_status := OLD.background_check_status;
  NEW.community_reviews_count := OLD.community_reviews_count;
  NEW.attended_meets_count    := OLD.attended_meets_count;
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_protect_trust_fields
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_profile_trust_fields();

-- Auto-create profile on new auth user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1), '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- Owner-scoped access to the private gov-ids bucket.
-- Path convention: "<auth.uid()>/<filename>"

CREATE POLICY "gov_ids owners can upload"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'gov-ids'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "gov_ids owners can read own"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'gov-ids'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "gov_ids owners can update own"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'gov-ids'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'gov-ids'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "gov_ids owners can delete own"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'gov-ids'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Track the latest uploaded ID path + submission status on the profile
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS gov_id_path text,
  ADD COLUMN IF NOT EXISTS gov_id_submitted_at timestamptz;
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarded_at timestamptz;

-- Conversations: 1-on-1 DM between two users. user_a < user_b for uniqueness.
CREATE TABLE public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_b UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT conv_user_order CHECK (user_a < user_b),
  CONSTRAINT conv_unique_pair UNIQUE (user_a, user_b)
);
CREATE INDEX conversations_user_a_idx ON public.conversations(user_a, last_message_at DESC);
CREATE INDEX conversations_user_b_idx ON public.conversations(user_b, last_message_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.conversations TO authenticated;
GRANT ALL ON public.conversations TO service_role;

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "participants can view conversations"
  ON public.conversations FOR SELECT TO authenticated
  USING (auth.uid() = user_a OR auth.uid() = user_b);

CREATE POLICY "participants can create conversations"
  ON public.conversations FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_a OR auth.uid() = user_b);

CREATE POLICY "participants can update conversations"
  ON public.conversations FOR UPDATE TO authenticated
  USING (auth.uid() = user_a OR auth.uid() = user_b)
  WITH CHECK (auth.uid() = user_a OR auth.uid() = user_b);

-- Messages
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX messages_conversation_idx ON public.messages(conversation_id, created_at);

GRANT SELECT, INSERT ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "participants can view messages"
  ON public.messages FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = conversation_id
      AND (auth.uid() = c.user_a OR auth.uid() = c.user_b)
  ));

CREATE POLICY "participants can send messages"
  ON public.messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id
        AND (auth.uid() = c.user_a OR auth.uid() = c.user_b)
    )
  );

-- Bump conversation.last_message_at on new message
CREATE OR REPLACE FUNCTION public.bump_conversation_last_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.conversations
    SET last_message_at = NEW.created_at
    WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER messages_bump_conversation
AFTER INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.bump_conversation_last_message();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
REVOKE EXECUTE ON FUNCTION public.bump_conversation_last_message() FROM PUBLIC, anon, authenticated;

CREATE TABLE public.connections (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  requester_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  CONSTRAINT connections_no_self CHECK (requester_id <> recipient_id),
  CONSTRAINT connections_unique_pair UNIQUE (requester_id, recipient_id)
);

CREATE INDEX connections_recipient_status_idx ON public.connections(recipient_id, status);
CREATE INDEX connections_requester_status_idx ON public.connections(requester_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.connections TO authenticated;
GRANT ALL ON public.connections TO service_role;

ALTER TABLE public.connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "participants can view connections"
  ON public.connections FOR SELECT TO authenticated
  USING (auth.uid() = requester_id OR auth.uid() = recipient_id);

CREATE POLICY "requester can create connection"
  ON public.connections FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = requester_id AND status = 'pending');

CREATE POLICY "participants can update connection"
  ON public.connections FOR UPDATE TO authenticated
  USING (auth.uid() = requester_id OR auth.uid() = recipient_id)
  WITH CHECK (auth.uid() = requester_id OR auth.uid() = recipient_id);

CREATE POLICY "requester can delete pending connection"
  ON public.connections FOR DELETE TO authenticated
  USING (auth.uid() = requester_id AND status = 'pending');

CREATE TRIGGER connections_set_updated_at
  BEFORE UPDATE ON public.connections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

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

-- Blocks
CREATE TABLE public.user_blocks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  blocker_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_blocks_distinct CHECK (blocker_id <> blocked_id),
  CONSTRAINT user_blocks_unique UNIQUE (blocker_id, blocked_id)
);
CREATE INDEX user_blocks_blocker_idx ON public.user_blocks(blocker_id);
CREATE INDEX user_blocks_blocked_idx ON public.user_blocks(blocked_id);

GRANT SELECT, INSERT, DELETE ON public.user_blocks TO authenticated;
GRANT ALL ON public.user_blocks TO service_role;

ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own blocks"
ON public.user_blocks FOR SELECT
TO authenticated
USING (auth.uid() = blocker_id);

CREATE POLICY "Users can create their own blocks"
ON public.user_blocks FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = blocker_id);

CREATE POLICY "Users can remove their own blocks"
ON public.user_blocks FOR DELETE
TO authenticated
USING (auth.uid() = blocker_id);

-- Reports
CREATE TABLE public.user_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  reporter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reported_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  details TEXT,
  context TEXT,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_reports_distinct CHECK (reporter_id <> reported_id),
  CONSTRAINT user_reports_status_check CHECK (status IN ('open','reviewing','resolved','dismissed')),
  CONSTRAINT user_reports_reason_check CHECK (char_length(reason) BETWEEN 2 AND 80)
);
CREATE INDEX user_reports_reporter_idx ON public.user_reports(reporter_id, created_at DESC);
CREATE INDEX user_reports_reported_idx ON public.user_reports(reported_id, created_at DESC);

GRANT SELECT, INSERT ON public.user_reports TO authenticated;
GRANT ALL ON public.user_reports TO service_role;

ALTER TABLE public.user_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reporters can view their own reports"
ON public.user_reports FOR SELECT
TO authenticated
USING (auth.uid() = reporter_id);

CREATE POLICY "Users can file reports"
ON public.user_reports FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = reporter_id);

ALTER TABLE public.meetups
  ADD COLUMN IF NOT EXISTS reschedule_by uuid,
  ADD COLUMN IF NOT EXISTS reschedule_place text,
  ADD COLUMN IF NOT EXISTS reschedule_address text,
  ADD COLUMN IF NOT EXISTS reschedule_scheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS reschedule_note text,
  ADD COLUMN IF NOT EXISTS reschedule_requested_at timestamptz;

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

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_path TEXT;

-- Any authenticated user can read avatar objects (needed for signed URLs).
CREATE POLICY "Authenticated can read avatars"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'avatars');

-- Users can upload only into their own folder: avatars/<uid>/...
CREATE POLICY "Users upload own avatar"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users update own avatar"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users delete own avatar"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- 1. Roles infrastructure
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

-- 2. Report review columns
ALTER TABLE public.user_reports
  ADD COLUMN reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN reviewed_at timestamptz,
  ADD COLUMN resolution text,
  ADD COLUMN admin_notes text,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

CREATE TRIGGER trg_user_reports_updated_at
  BEFORE UPDATE ON public.user_reports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Allowed statuses: open, under_review, action_taken, dismissed
-- Allowed resolutions: warning, account_suspended, account_banned, no_action, duplicate

-- 3. Admin RLS on user_reports (add to existing user policies)
CREATE POLICY "Admins can view all reports"
  ON public.user_reports FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'));

CREATE POLICY "Admins can update reports"
  ON public.user_reports FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'));

-- 4. Admin RLS on user_blocks (view only)
CREATE POLICY "Admins can view all blocks"
  ON public.user_blocks FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'));

-- 5. Admin RLS on profiles (view any profile for review)
CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'));

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS age_confirmed_at TIMESTAMPTZ;

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

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE TABLE public.push_subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX push_subscriptions_user_id_idx ON public.push_subscriptions(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own push subscriptions"
  ON public.push_subscriptions FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER push_subscriptions_set_updated_at
  BEFORE UPDATE ON public.push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TYPE public.activity_category AS ENUM ('Coffee & Chat', 'Walk', 'Study', 'Sports', 'Food', 'Music Jam', 'House Party', 'Youth Meetup', 'Birthday Party', 'Fun Hangout');
CREATE TYPE public.activity_status AS ENUM ('active', 'cancelled', 'completed');

CREATE TABLE public.activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 3 AND 120),
  category public.activity_category NOT NULL,
  emoji TEXT,
  description TEXT CHECK (description IS NULL OR length(description) <= 600),
  location_name TEXT,
  location_lat DOUBLE PRECISION,
  location_lng DOUBLE PRECISION,
  starts_at TIMESTAMPTZ NOT NULL,
  spots_total INT NOT NULL DEFAULT 4 CHECK (spots_total BETWEEN 2 AND 20),
  spots_filled INT NOT NULL DEFAULT 0 CHECK (spots_filled >= 0),
  distance_hint TEXT,
  status public.activity_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX activities_host_id_idx ON public.activities(host_id);
CREATE INDEX activities_starts_at_idx ON public.activities(starts_at);
CREATE INDEX activities_category_idx ON public.activities(category);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.activities TO authenticated;
GRANT ALL ON public.activities TO service_role;

ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view active activities"
  ON public.activities FOR SELECT
  TO authenticated
  USING (status <> 'cancelled');

CREATE POLICY "Hosts can create their own activities"
  ON public.activities FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = host_id);

CREATE POLICY "Hosts can update their own activities"
  ON public.activities FOR UPDATE
  TO authenticated
  USING (auth.uid() = host_id)
  WITH CHECK (auth.uid() = host_id);

CREATE POLICY "Hosts can delete their own activities"
  ON public.activities FOR DELETE
  TO authenticated
  USING (auth.uid() = host_id);

CREATE TRIGGER activities_set_updated_at
  BEFORE UPDATE ON public.activities
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations TO authenticated;
GRANT ALL ON public.conversations TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.conversations TO authenticated;
GRANT ALL ON TABLE public.conversations TO service_role;
GRANT SELECT, INSERT ON TABLE public.messages TO authenticated;
GRANT ALL ON TABLE public.messages TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.conversations TO authenticated;
GRANT SELECT, INSERT ON TABLE public.messages TO authenticated;
GRANT ALL ON TABLE public.conversations TO service_role;
GRANT ALL ON TABLE public.messages TO service_role;

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

REVOKE EXECUTE ON FUNCTION public.bump_reviewee_stats() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_on_message() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_on_connection() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_on_meetup() FROM PUBLIC, anon, authenticated;
CREATE TABLE public.gov_id_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  viewer_id uuid NOT NULL,
  target_id uuid NOT NULL,
  viewed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.gov_id_views TO authenticated;
GRANT ALL ON public.gov_id_views TO service_role;
ALTER TABLE public.gov_id_views ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can see their own view history" ON public.gov_id_views FOR SELECT USING (auth.uid() = viewer_id OR auth.uid() = target_id);
CREATE POLICY "Users can log their own views" ON public.gov_id_views FOR INSERT WITH CHECK (auth.uid() = viewer_id);
CREATE INDEX idx_gov_id_views_target ON public.gov_id_views(target_id, viewed_at DESC);

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

REVOKE EXECUTE ON FUNCTION public.is_blocked_between(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_blocked_between(uuid, uuid) TO authenticated, service_role;

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

-- Revoke EXECUTE from signed-in users on SECURITY DEFINER trigger functions.
-- These are only invoked internally by triggers (which run as table owner)
-- and should not be callable directly by anon/authenticated roles.

REVOKE EXECUTE ON FUNCTION public.notify_on_message() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bump_conversation_last_message() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bump_reviewee_stats() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_on_meetup() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_on_connection() FROM PUBLIC, anon, authenticated;

-- is_blocked_between is used inside RLS policies evaluated by the authenticated
-- role, so it must remain executable by authenticated. Keep it as-is.

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
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;

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
