
CREATE TYPE public.activity_category AS ENUM ('Coffee & Chat', 'Walk', 'Study', 'Sports', 'Food');
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
