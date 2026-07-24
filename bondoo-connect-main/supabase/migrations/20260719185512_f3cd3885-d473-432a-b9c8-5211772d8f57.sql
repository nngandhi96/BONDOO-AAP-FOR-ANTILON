
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
