CREATE TABLE public.assistente_redacao_uso (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL,
  conversa_id uuid,
  modo text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_assistente_uso_usuario_created ON public.assistente_redacao_uso (usuario_id, created_at DESC);
GRANT SELECT, INSERT ON public.assistente_redacao_uso TO authenticated;
GRANT ALL ON public.assistente_redacao_uso TO service_role;
ALTER TABLE public.assistente_redacao_uso ENABLE ROW LEVEL SECURITY;
CREATE POLICY "usuario_ve_proprio_uso" ON public.assistente_redacao_uso FOR SELECT TO authenticated USING (usuario_id = auth.uid());
CREATE POLICY "usuario_registra_proprio_uso" ON public.assistente_redacao_uso FOR INSERT TO authenticated WITH CHECK (usuario_id = auth.uid());