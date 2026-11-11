-- Migration: Add city, latitude, and longitude to posts and activities for location-based filtering

-- 1. Ensure posts table exists and has city, latitude, longitude
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'posts') THEN
    CREATE TABLE public.posts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      content TEXT,
      category TEXT,
      city TEXT,
      latitude DOUBLE PRECISION,
      longitude DOUBLE PRECISION,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

    CREATE POLICY "Posts are viewable by everyone"
      ON public.posts FOR SELECT
      USING (true);

    CREATE POLICY "Users can create posts"
      ON public.posts FOR INSERT
      WITH CHECK (auth.uid() = user_id);

    CREATE POLICY "Users can update own posts"
      ON public.posts FOR UPDATE
      USING (auth.uid() = user_id);

    CREATE POLICY "Users can delete own posts"
      ON public.posts FOR DELETE
      USING (auth.uid() = user_id);
  ELSE
    ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS city TEXT;
    ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
    ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
  END IF;
END $$;

-- 2. Create index on LOWER(city) for high-performance feed filtering on posts
CREATE INDEX IF NOT EXISTS idx_posts_city_lower ON public.posts (LOWER(city));

-- 3. Also add city, latitude, and longitude to activities (the activity post feed in Bondoo)
ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

-- Sync existing location_lat/location_lng coordinates if present
UPDATE public.activities
SET latitude = location_lat
WHERE latitude IS NULL AND location_lat IS NOT NULL;

UPDATE public.activities
SET longitude = location_lng
WHERE longitude IS NULL AND location_lng IS NOT NULL;

-- 4. Create index on LOWER(city) for high-performance feed filtering on activities
CREATE INDEX IF NOT EXISTS idx_activities_city_lower ON public.activities (LOWER(city));

