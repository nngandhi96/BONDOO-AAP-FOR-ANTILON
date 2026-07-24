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