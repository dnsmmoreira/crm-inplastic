
-- =========================================================
-- Fase 1 — Fundação de dados do Xerife 2.0
-- =========================================================

-- 1a. Estender tarefas -------------------------------------------------
ALTER TABLE public.tarefas
  ADD COLUMN IF NOT EXISTS tipo text,
  ADD COLUMN IF NOT EXISTS descricao text,
  ADD COLUMN IF NOT EXISTS prioridade int NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS hora_sugerida time,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS nota_conclusao text,
  ADD COLUMN IF NOT EXISTS escalonamentos int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS concluida_at timestamptz,
  ADD COLUMN IF NOT EXISTS motivo_adiamento text;

-- Normalizar valores antigos de kind (antes das checks/backfill)
UPDATE public.tarefas SET kind = 'follow_up' WHERE kind IN ('followup','follow-up','follow up');
UPDATE public.tarefas SET kind = NULL
  WHERE kind IS NOT NULL AND kind NOT IN (
    'follow_up','primeiro_contato','resposta_pendente','cadencia_proposta',
    'pos_venda_confirmacao','pos_venda_satisfacao','pos_venda_recompra',
    'resgate_carteira','reativacao_lead','prospeccao'
  );

-- CHECKs
DO $$ BEGIN
  ALTER TABLE public.tarefas
    ADD CONSTRAINT tarefas_status_chk CHECK (status IN ('pendente','concluida','adiada'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.tarefas
    ADD CONSTRAINT tarefas_origem_chk CHECK (origem IN ('manual','xerife'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.tarefas
    ADD CONSTRAINT tarefas_tipo_chk CHECK (tipo IS NULL OR tipo IN (
      'follow_up','primeiro_contato','resposta_pendente','cadencia_proposta',
      'pos_venda_confirmacao','pos_venda_satisfacao','pos_venda_recompra',
      'resgate_carteira','reativacao_lead','prospeccao'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Backfill dos novos campos a partir dos antigos
UPDATE public.tarefas SET
  status = CASE WHEN done THEN 'concluida' ELSE 'pendente' END,
  tipo = COALESCE(tipo, kind, 'follow_up'),
  descricao = COALESCE(descricao, title),
  origem = CASE WHEN auto_generated THEN 'xerife' ELSE 'manual' END,
  concluida_at = CASE WHEN done AND concluida_at IS NULL THEN updated_at ELSE concluida_at END
WHERE tipo IS NULL OR descricao IS NULL;

CREATE INDEX IF NOT EXISTS tarefas_status_prio_idx ON public.tarefas (status, prioridade, due_date);
CREATE INDEX IF NOT EXISTS tarefas_tipo_lead_idx ON public.tarefas (tipo, lead_id, status);

-- Trigger de sincronização done<->status, title<->descricao, kind<->tipo, auto_generated<->origem
CREATE OR REPLACE FUNCTION public.tg_tarefas_sync()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status = 'concluida' THEN
    NEW.done := true;
    IF NEW.concluida_at IS NULL THEN NEW.concluida_at := now(); END IF;
  ELSIF NEW.status IN ('pendente','adiada') THEN
    NEW.done := false;
  END IF;

  IF NEW.descricao IS NULL OR NEW.descricao = '' THEN NEW.descricao := NEW.title; END IF;
  IF NEW.title IS NULL OR NEW.title = '' THEN NEW.title := COALESCE(NEW.descricao, ''); END IF;

  IF NEW.kind IS NULL AND NEW.tipo IS NOT NULL THEN NEW.kind := NEW.tipo; END IF;
  IF NEW.tipo IS NULL AND NEW.kind IS NOT NULL THEN NEW.tipo := NEW.kind; END IF;

  NEW.auto_generated := (NEW.origem = 'xerife');

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS tarefas_sync ON public.tarefas;
CREATE TRIGGER tarefas_sync BEFORE INSERT OR UPDATE ON public.tarefas
FOR EACH ROW EXECUTE FUNCTION public.tg_tarefas_sync();

CREATE OR REPLACE FUNCTION public.tg_tarefas_protect()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.origem = 'xerife' AND OLD.tipo LIKE 'pos_venda_%' THEN
      RAISE EXCEPTION 'Tarefas de pós-venda não podem ser deletadas — apenas concluídas com nota.';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status = 'concluida' AND OLD.status <> 'concluida' THEN
    IF NEW.origem = 'xerife' AND NEW.tipo LIKE 'pos_venda_%'
       AND (NEW.nota_conclusao IS NULL OR btrim(NEW.nota_conclusao) = '') THEN
      RAISE EXCEPTION 'Conclusão de tarefa de pós-venda exige nota de conclusão preenchida.';
    END IF;
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS tarefas_protect_del ON public.tarefas;
CREATE TRIGGER tarefas_protect_del BEFORE DELETE ON public.tarefas
FOR EACH ROW EXECUTE FUNCTION public.tg_tarefas_protect();

DROP TRIGGER IF EXISTS tarefas_protect_upd ON public.tarefas;
CREATE TRIGGER tarefas_protect_upd BEFORE UPDATE ON public.tarefas
FOR EACH ROW EXECUTE FUNCTION public.tg_tarefas_protect();

-- 1b. Novos campos em leads --------------------------------------------
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS etapa_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_contact_at timestamptz,
  ADD COLUMN IF NOT EXISTS ultima_msg_cliente_at timestamptz,
  ADD COLUMN IF NOT EXISTS ultima_msg_vendedor_at timestamptz,
  ADD COLUMN IF NOT EXISTS proposta_enviada_at timestamptz,
  ADD COLUMN IF NOT EXISTS esfriando boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS leads_last_contact_idx ON public.leads (last_contact_at);
CREATE INDEX IF NOT EXISTS leads_etapa_changed_idx ON public.leads (etapa_changed_at);
CREATE INDEX IF NOT EXISTS leads_proposta_enviada_idx ON public.leads (proposta_enviada_at) WHERE proposta_enviada_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.tg_leads_stage_track()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.etapa_changed_at := COALESCE(NEW.etapa_changed_at, now());
    IF NEW.stage::text = 'proposta' THEN
      NEW.proposta_enviada_at := COALESCE(NEW.proposta_enviada_at, now());
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.stage IS DISTINCT FROM OLD.stage THEN
    NEW.etapa_changed_at := now();
    IF NEW.stage::text = 'proposta' AND OLD.stage::text <> 'proposta' THEN
      NEW.proposta_enviada_at := now();
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS leads_stage_track ON public.leads;
CREATE TRIGGER leads_stage_track BEFORE INSERT OR UPDATE OF stage ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.tg_leads_stage_track();

CREATE OR REPLACE FUNCTION public.tg_wa_msg_lead_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE _lead uuid;
BEGIN
  SELECT lead_id INTO _lead FROM public.whatsapp_conversas WHERE id = NEW.conversa_id;
  IF _lead IS NULL THEN RETURN NEW; END IF;

  IF NEW.autor = 'cliente' THEN
    UPDATE public.leads SET ultima_msg_cliente_at = NEW.created_at WHERE id = _lead;
  ELSIF NEW.autor = 'vendedor' THEN
    UPDATE public.leads
       SET ultima_msg_vendedor_at = NEW.created_at,
           last_contact_at = NEW.created_at
     WHERE id = _lead;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS wa_msg_lead_touch ON public.whatsapp_mensagens;
CREATE TRIGGER wa_msg_lead_touch AFTER INSERT ON public.whatsapp_mensagens
FOR EACH ROW EXECUTE FUNCTION public.tg_wa_msg_lead_touch();

CREATE OR REPLACE FUNCTION public.tg_lead_interaction_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  UPDATE public.leads SET last_contact_at = COALESCE(NEW.occurred_at, now())
   WHERE id = NEW.lead_id;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS lead_interaction_last_contact ON public.lead_interactions;
CREATE TRIGGER lead_interaction_last_contact AFTER INSERT ON public.lead_interactions
FOR EACH ROW EXECUTE FUNCTION public.tg_lead_interaction_touch();

CREATE OR REPLACE FUNCTION public.tg_tarefa_concluida_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status = 'concluida' AND OLD.status <> 'concluida' AND NEW.lead_id IS NOT NULL THEN
    UPDATE public.leads SET last_contact_at = COALESCE(NEW.concluida_at, now()) WHERE id = NEW.lead_id;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS tarefa_concluida_touch ON public.tarefas;
CREATE TRIGGER tarefa_concluida_touch AFTER UPDATE ON public.tarefas
FOR EACH ROW EXECUTE FUNCTION public.tg_tarefa_concluida_touch();

-- 1c. Extensão do xerife_config ----------------------------------------
ALTER TABLE public.xerife_config
  ADD COLUMN IF NOT EXISTS sla_primeiro_contato_min int NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS sla_primeiro_contato_escalar_min int NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS sla_resposta_whatsapp_horas int NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS sla_resposta_whatsapp_escalar_horas int NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS max_dias_etapa jsonb NOT NULL DEFAULT '{"novo":1,"qualificacao":2,"proposta":3,"negociacao":5}'::jsonb,
  ADD COLUMN IF NOT EXISTS cadencia_proposta_dias int[] NOT NULL DEFAULT ARRAY[2,5,10,15],
  ADD COLUMN IF NOT EXISTS carteira_alerta_dias int NOT NULL DEFAULT 45,
  ADD COLUMN IF NOT EXISTS carteira_critico_dias int NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS reciclagem_perdidos_dias int NOT NULL DEFAULT 90,
  ADD COLUMN IF NOT EXISTS pos_venda_dias int[] NOT NULL DEFAULT ARRAY[3,15,45],
  ADD COLUMN IF NOT EXISTS meta_atividades_dia int NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS dias_uteis_inicio time NOT NULL DEFAULT '08:00',
  ADD COLUMN IF NOT EXISTS dias_uteis_fim time NOT NULL DEFAULT '18:00';

-- 1d. Tabela xerife_log ------------------------------------------------
CREATE TABLE IF NOT EXISTS public.xerife_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  regra text NOT NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  cliente_id uuid,
  vendedor_id uuid,
  acao_tomada text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.xerife_log TO authenticated;
GRANT ALL ON public.xerife_log TO service_role;

ALTER TABLE public.xerife_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "xerife_log read own or admin" ON public.xerife_log;
CREATE POLICY "xerife_log read own or admin" ON public.xerife_log
  FOR SELECT TO authenticated
  USING (vendedor_id = auth.uid() OR has_role(auth.uid(),'admin'::app_role));

DROP POLICY IF EXISTS "xerife_log insert admin" ON public.xerife_log;
CREATE POLICY "xerife_log insert admin" ON public.xerife_log
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'admin'::app_role));

CREATE INDEX IF NOT EXISTS xerife_log_regra_lead_idx ON public.xerife_log (regra, lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS xerife_log_vendedor_idx ON public.xerife_log (vendedor_id, created_at DESC);

-- 1e. Backfill final ---------------------------------------------------
UPDATE public.leads
   SET etapa_changed_at = COALESCE(etapa_changed_at, updated_at, created_at),
       last_contact_at  = COALESCE(last_contact_at, last_interaction_at, last_contact, updated_at),
       proposta_enviada_at = CASE
         WHEN proposta_enviada_at IS NULL AND stage::text = 'proposta' THEN COALESCE(updated_at, created_at)
         ELSE proposta_enviada_at
       END;
