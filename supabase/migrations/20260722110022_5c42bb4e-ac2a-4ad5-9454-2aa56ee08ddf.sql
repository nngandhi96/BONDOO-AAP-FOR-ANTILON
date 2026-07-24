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