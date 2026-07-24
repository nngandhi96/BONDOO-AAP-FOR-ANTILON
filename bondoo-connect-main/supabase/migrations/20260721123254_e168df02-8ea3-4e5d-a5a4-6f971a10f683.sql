
ALTER TABLE public.meetups
  ADD COLUMN IF NOT EXISTS reschedule_by uuid,
  ADD COLUMN IF NOT EXISTS reschedule_place text,
  ADD COLUMN IF NOT EXISTS reschedule_address text,
  ADD COLUMN IF NOT EXISTS reschedule_scheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS reschedule_note text,
  ADD COLUMN IF NOT EXISTS reschedule_requested_at timestamptz;
