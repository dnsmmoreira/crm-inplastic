-- ITEM 1
ALTER TABLE public.whatsapp_mensagens
  ADD COLUMN IF NOT EXISTS usuario_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL;

-- ITEM 2
CREATE TABLE IF NOT EXISTS public.lead_owner_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL,
  owner_anterior uuid NULL,
  owner_novo uuid NULL,
  origem text NOT NULL,
  contexto jsonb NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lead_owner_history_lead_id ON public.lead_owner_history(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_owner_history_criado_em ON public.lead_owner_history(criado_em);

GRANT SELECT ON public.lead_owner_history TO authenticated;
GRANT ALL ON public.lead_owner_history TO service_role;
REVOKE INSERT, UPDATE, DELETE ON public.lead_owner_history FROM anon, authenticated;

ALTER TABLE public.lead_owner_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lead_owner_history_select" ON public.lead_owner_history
  FOR SELECT TO authenticated USING (true);

-- ITEM 3
CREATE TABLE IF NOT EXISTS public.lead_stage_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL,
  etapa_anterior text NULL,
  etapa_nova text NULL,
  origem text NOT NULL,
  contexto jsonb NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lead_stage_history_lead_id ON public.lead_stage_history(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_stage_history_criado_em ON public.lead_stage_history(criado_em);

GRANT SELECT ON public.lead_stage_history TO authenticated;
GRANT ALL ON public.lead_stage_history TO service_role;
REVOKE INSERT, UPDATE, DELETE ON public.lead_stage_history FROM anon, authenticated;

ALTER TABLE public.lead_stage_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lead_stage_history_select" ON public.lead_stage_history
  FOR SELECT TO authenticated USING (true);

-- ITEM 4 (contexto + origem)
CREATE OR REPLACE FUNCTION public.tg_lead_history_track()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _origem text;
  _ctx jsonb;
BEGIN
  BEGIN
    _origem := coalesce(current_setting('app.origem', true), 'desconhecido');
    IF _origem = '' THEN _origem := 'desconhecido'; END IF;
    _ctx := jsonb_build_object(
      'request_method', current_setting('request.method', true),
      'request_path',   current_setting('request.path', true),
      'current_user',   current_user,
      'session_user',   session_user
    );

    IF TG_OP = 'INSERT' THEN
      IF NEW.owner_id IS NOT NULL THEN
        INSERT INTO public.lead_owner_history (lead_id, owner_anterior, owner_novo, origem, contexto)
        VALUES (NEW.id, NULL, NEW.owner_id, _origem, _ctx);
      END IF;
      IF NEW.stage IS NOT NULL THEN
        INSERT INTO public.lead_stage_history (lead_id, etapa_anterior, etapa_nova, origem, contexto)
        VALUES (NEW.id, NULL, NEW.stage::text, _origem, _ctx);
      END IF;
    ELSE
      IF OLD.owner_id IS DISTINCT FROM NEW.owner_id THEN
        INSERT INTO public.lead_owner_history (lead_id, owner_anterior, owner_novo, origem, contexto)
        VALUES (NEW.id, OLD.owner_id, NEW.owner_id, _origem, _ctx);
      END IF;
      IF OLD.stage IS DISTINCT FROM NEW.stage THEN
        INSERT INTO public.lead_stage_history (lead_id, etapa_anterior, etapa_nova, origem, contexto)
        VALUES (NEW.id, OLD.stage::text, NEW.stage::text, _origem, _ctx);
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL; -- nunca aborta a transação do lead
  END;
  RETURN NULL; -- AFTER trigger: não altera nenhuma coluna de leads
END;
$$;

DROP TRIGGER IF EXISTS leads_history_track_ins ON public.leads;
CREATE TRIGGER leads_history_track_ins
AFTER INSERT ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.tg_lead_history_track();

DROP TRIGGER IF EXISTS leads_history_track_upd ON public.leads;
CREATE TRIGGER leads_history_track_upd
AFTER UPDATE ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.tg_lead_history_track();