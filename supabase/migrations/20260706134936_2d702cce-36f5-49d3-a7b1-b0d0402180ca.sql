CREATE TABLE public.zapi_inbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  name text,
  message text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed boolean NOT NULL DEFAULT false,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, UPDATE ON public.zapi_inbox TO authenticated;
GRANT ALL ON public.zapi_inbox TO service_role;

ALTER TABLE public.zapi_inbox ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read inbox" ON public.zapi_inbox
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated mark processed" ON public.zapi_inbox
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX zapi_inbox_processed_idx ON public.zapi_inbox (processed, received_at DESC);