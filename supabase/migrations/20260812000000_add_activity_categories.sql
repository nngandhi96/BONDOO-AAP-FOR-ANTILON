-- Add new activity categories to activity_category enum
ALTER TYPE public.activity_category ADD VALUE IF NOT EXISTS 'Music Jam';
ALTER TYPE public.activity_category ADD VALUE IF NOT EXISTS 'House Party';
ALTER TYPE public.activity_category ADD VALUE IF NOT EXISTS 'Youth Meetup';
ALTER TYPE public.activity_category ADD VALUE IF NOT EXISTS 'Birthday Party';
ALTER TYPE public.activity_category ADD VALUE IF NOT EXISTS 'Fun Hangout';
