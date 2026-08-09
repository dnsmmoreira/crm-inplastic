CREATE TABLE public.zapi_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  telefone_mascarado text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.zapi_eventos TO authenticated;
GRANT ALL ON public.zapi_eventos TO service_role;
ALTER TABLE public.zapi_eventos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins podem ver eventos zapi" ON public.zapi_eventos
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX idx_zapi_eventos_tipo_created ON public.zapi_eventos (tipo, created_at DESC);

CREATE TABLE public.zapi_estado (
  chave text PRIMARY KEY,
  valor jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.zapi_estado TO authenticated;
GRANT ALL ON public.zapi_estado TO service_role;
ALTER TABLE public.zapi_estado ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins podem ver estado zapi" ON public.zapi_estado
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER zapi_estado_updated_at BEFORE UPDATE ON public.zapi_estado
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.ia_respostas_pendentes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_id uuid NOT NULL REFERENCES public.whatsapp_conversas(id) ON DELETE CASCADE,
  mensagem text NOT NULL,
  responder_apos timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pendente',
  erro text,
  enviado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ia_respostas_pendentes TO authenticated;
GRANT ALL ON public.ia_respostas_pendentes TO service_role;
ALTER TABLE public.ia_respostas_pendentes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins podem ver respostas pendentes" ON public.ia_respostas_pendentes
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX idx_ia_resp_pend_status ON public.ia_respostas_pendentes (status, responder_apos);
CREATE INDEX idx_ia_resp_pend_conversa ON public.ia_respostas_pendentes (conversa_id, created_at DESC);
CREATE TRIGGER ia_respostas_pendentes_updated_at BEFORE UPDATE ON public.ia_respostas_pendentes
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();