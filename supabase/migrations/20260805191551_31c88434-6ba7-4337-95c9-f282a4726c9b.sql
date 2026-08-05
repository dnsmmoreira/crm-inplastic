ALTER TABLE public.whatsapp_conversas
  ADD COLUMN IF NOT EXISTS atribuido_para uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS atribuido_em timestamptz;

CREATE INDEX IF NOT EXISTS whatsapp_conversas_atribuido_para_idx
  ON public.whatsapp_conversas (atribuido_para);

DROP POLICY IF EXISTS "conversas select" ON public.whatsapp_conversas;
CREATE POLICY "conversas select" ON public.whatsapp_conversas
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR atribuido_para = auth.uid()
    OR EXISTS (SELECT 1 FROM public.leads l WHERE l.id = whatsapp_conversas.lead_id AND l.owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "conversas update owner or admin" ON public.whatsapp_conversas;
CREATE POLICY "conversas update owner or admin" ON public.whatsapp_conversas
  FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR atribuido_para = auth.uid()
    OR EXISTS (SELECT 1 FROM public.leads l WHERE l.id = whatsapp_conversas.lead_id AND l.owner_id = auth.uid())
  );

CREATE TABLE IF NOT EXISTS public.notificacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo text NOT NULL,
  conversa_id uuid REFERENCES public.whatsapp_conversas(id) ON DELETE CASCADE,
  titulo text,
  lida_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notificacoes TO authenticated;
GRANT ALL ON public.notificacoes TO service_role;

ALTER TABLE public.notificacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notificacoes select own" ON public.notificacoes
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "notificacoes update own" ON public.notificacoes
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "notificacoes delete own" ON public.notificacoes
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS notificacoes_user_nao_lidas_idx
  ON public.notificacoes (user_id, lida_em);

CREATE OR REPLACE FUNCTION public.tg_conversa_atribuida_notifica()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.atribuido_para IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.atribuido_para IS DISTINCT FROM NEW.atribuido_para) THEN
    NEW.atribuido_em := now();
    INSERT INTO public.notificacoes (user_id, tipo, conversa_id, titulo)
    VALUES (
      NEW.atribuido_para,
      'conversa_atribuida',
      NEW.id,
      'Nova conversa atribuída' || COALESCE(' — ' || NEW.name, '')
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS conversa_atribuida_notifica_ins ON public.whatsapp_conversas;
CREATE TRIGGER conversa_atribuida_notifica_ins
  BEFORE INSERT ON public.whatsapp_conversas
  FOR EACH ROW EXECUTE FUNCTION public.tg_conversa_atribuida_notifica();

DROP TRIGGER IF EXISTS conversa_atribuida_notifica_upd ON public.whatsapp_conversas;
CREATE TRIGGER conversa_atribuida_notifica_upd
  BEFORE UPDATE ON public.whatsapp_conversas
  FOR EACH ROW EXECUTE FUNCTION public.tg_conversa_atribuida_notifica();

ALTER PUBLICATION supabase_realtime ADD TABLE public.notificacoes;