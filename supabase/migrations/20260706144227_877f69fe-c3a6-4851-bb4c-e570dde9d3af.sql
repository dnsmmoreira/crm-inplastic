
-- ============================================================
-- 1. Extensões
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ============================================================
-- 2. profiles: adicionar telefone_whatsapp
-- ============================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS telefone_whatsapp text;

-- ============================================================
-- 3. Enums canônicos
-- ============================================================
DO $$ BEGIN
  CREATE TYPE public.lead_stage AS ENUM (
    'atendimento','novo','qualificacao','proposta','negociacao','ganho','perdido'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.proposal_status AS ENUM (
    'rascunho','enviada','aguardando_aprovacao','aprovada','recusada','pedido'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.interaction_type AS ENUM (
    'email','call','meeting','note','whatsapp'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.ai_action_type AS ENUM (
    'followup','schedule','qualify','reply','alerta','resumo'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.conversa_status AS ENUM (
    'ia_atendendo','humano_atendendo','qualificado','encerrado'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.msg_direcao AS ENUM ('entrada','saida');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.msg_autor AS ENUM ('cliente','ia','vendedor');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 4. Helper: updated_at trigger
-- ============================================================
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ============================================================
-- 5. Cadastros globais
-- ============================================================

-- emitters
CREATE TABLE IF NOT EXISTS public.emitters (
  id text PRIMARY KEY,
  brand text NOT NULL,
  tagline text,
  legal_name text NOT NULL,
  cnpj text NOT NULL,
  ie text,
  address text,
  phone text,
  whatsapp text,
  email text,
  website text,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.emitters TO authenticated;
GRANT ALL ON public.emitters TO service_role;
ALTER TABLE public.emitters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "emitters read authenticated" ON public.emitters
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "emitters admin write" ON public.emitters
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE TRIGGER emitters_updated_at BEFORE UPDATE ON public.emitters
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- produtos
CREATE TABLE IF NOT EXISTS public.produtos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku text NOT NULL UNIQUE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  unit text NOT NULL DEFAULT 'Un',
  weight_kg numeric NOT NULL DEFAULT 0,
  height_cm numeric NOT NULL DEFAULT 0,
  width_cm numeric NOT NULL DEFAULT 0,
  length_cm numeric NOT NULL DEFAULT 0,
  ncm text,
  default_price numeric NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.produtos TO authenticated;
GRANT ALL ON public.produtos TO service_role;
ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "produtos read authenticated" ON public.produtos
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "produtos admin write" ON public.produtos
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE TRIGGER produtos_updated_at BEFORE UPDATE ON public.produtos
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- condicoes_pagamento
CREATE TABLE IF NOT EXISTS public.condicoes_pagamento (
  id text PRIMARY KEY,
  label text NOT NULL,
  method text NOT NULL,
  splits jsonb NOT NULL DEFAULT '[0]'::jsonb,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.condicoes_pagamento TO authenticated;
GRANT ALL ON public.condicoes_pagamento TO service_role;
ALTER TABLE public.condicoes_pagamento ENABLE ROW LEVEL SECURITY;
CREATE POLICY "condicoes read authenticated" ON public.condicoes_pagamento
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "condicoes admin write" ON public.condicoes_pagamento
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE TRIGGER condicoes_updated_at BEFORE UPDATE ON public.condicoes_pagamento
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============================================================
-- 6. Leads e derivados
-- ============================================================

CREATE TABLE IF NOT EXISTS public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  company text NOT NULL,
  contact_name text NOT NULL DEFAULT '',
  email text,
  phone text,
  telefone_whatsapp text,       -- só dígitos com DDI 55
  product text,
  product_id uuid REFERENCES public.produtos(id) ON DELETE SET NULL,
  quantity integer NOT NULL DEFAULT 0,
  estimated_value numeric NOT NULL DEFAULT 0,
  stage public.lead_stage NOT NULL DEFAULT 'novo',
  tags text[] NOT NULL DEFAULT '{}',
  segment text,
  source text NOT NULL DEFAULT '',
  origem text,
  external_id text,
  next_followup timestamptz,
  notes text NOT NULL DEFAULT '',
  cnpj text,
  razao_social text,
  nome_fantasia text,
  inscricao_estadual text,
  inscricao_municipal text,
  endereco jsonb,
  email_financeiro text,
  telefone_fixo text,
  whatsapp text,
  site text,
  porte text,
  cnae_principal text,
  faturamento_estimado numeric,
  num_funcionarios integer,
  decisor_nome text,
  decisor_cargo text,
  last_contact timestamptz,
  last_interaction_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS leads_cnpj_uniq ON public.leads(cnpj) WHERE cnpj IS NOT NULL;
CREATE INDEX IF NOT EXISTS leads_owner_idx ON public.leads(owner_id);
CREATE INDEX IF NOT EXISTS leads_stage_idx ON public.leads(stage);
CREATE INDEX IF NOT EXISTS leads_wa_idx ON public.leads(telefone_whatsapp);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO authenticated;
GRANT ALL ON public.leads TO service_role;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leads owner select" ON public.leads FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR has_role(auth.uid(), 'admin'));
CREATE POLICY "leads owner insert" ON public.leads FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid() OR has_role(auth.uid(), 'admin'));
CREATE POLICY "leads owner update" ON public.leads FOR UPDATE TO authenticated
  USING (owner_id = auth.uid() OR has_role(auth.uid(), 'admin'))
  WITH CHECK (owner_id = auth.uid() OR has_role(auth.uid(), 'admin'));
CREATE POLICY "leads admin delete" ON public.leads FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'));

CREATE TRIGGER leads_updated_at BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- lead_interactions
CREATE TABLE IF NOT EXISTS public.lead_interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  type public.interaction_type NOT NULL,
  content text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lead_interactions_lead_idx ON public.lead_interactions(lead_id, occurred_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_interactions TO authenticated;
GRANT ALL ON public.lead_interactions TO service_role;
ALTER TABLE public.lead_interactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "interactions select via lead" ON public.lead_interactions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_id AND (l.owner_id = auth.uid() OR has_role(auth.uid(), 'admin'))));
CREATE POLICY "interactions write via lead" ON public.lead_interactions FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_id AND (l.owner_id = auth.uid() OR has_role(auth.uid(), 'admin'))));
CREATE POLICY "interactions update via lead" ON public.lead_interactions FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_id AND (l.owner_id = auth.uid() OR has_role(auth.uid(), 'admin'))));
CREATE POLICY "interactions delete via lead" ON public.lead_interactions FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_id AND (l.owner_id = auth.uid() OR has_role(auth.uid(), 'admin'))));

-- lead_ai_actions (diário do Xerife)
CREATE TABLE IF NOT EXISTS public.lead_ai_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  type public.ai_action_type NOT NULL,
  content text NOT NULL,
  metadata jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lead_ai_actions_lead_idx ON public.lead_ai_actions(lead_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS lead_ai_actions_type_idx ON public.lead_ai_actions(type, occurred_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_ai_actions TO authenticated;
GRANT ALL ON public.lead_ai_actions TO service_role;
ALTER TABLE public.lead_ai_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_actions select" ON public.lead_ai_actions FOR SELECT TO authenticated
  USING (
    lead_id IS NULL AND has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_id AND (l.owner_id = auth.uid() OR has_role(auth.uid(), 'admin')))
  );
CREATE POLICY "ai_actions insert admin" ON public.lead_ai_actions FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'));

-- Trigger: interação atualiza last_interaction_at do lead
CREATE OR REPLACE FUNCTION public.tg_touch_lead_last_interaction()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  UPDATE public.leads SET last_interaction_at = COALESCE(NEW.occurred_at, now())
   WHERE id = NEW.lead_id;
  RETURN NEW;
END; $$;

CREATE TRIGGER lead_interactions_touch_lead
  AFTER INSERT ON public.lead_interactions
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_lead_last_interaction();

-- tarefas
CREATE TABLE IF NOT EXISTS public.tarefas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  title text NOT NULL,
  due_date timestamptz NOT NULL,
  done boolean NOT NULL DEFAULT false,
  auto_generated boolean NOT NULL DEFAULT false,
  kind text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tarefas_owner_idx ON public.tarefas(owner_id, done, due_date);
CREATE INDEX IF NOT EXISTS tarefas_lead_idx ON public.tarefas(lead_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tarefas TO authenticated;
GRANT ALL ON public.tarefas TO service_role;
ALTER TABLE public.tarefas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tarefas owner all" ON public.tarefas FOR ALL TO authenticated
  USING (owner_id = auth.uid() OR has_role(auth.uid(), 'admin'))
  WITH CHECK (owner_id = auth.uid() OR has_role(auth.uid(), 'admin'));
CREATE TRIGGER tarefas_updated_at BEFORE UPDATE ON public.tarefas
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============================================================
-- 7. Propostas e Pedidos
-- ============================================================

CREATE TABLE IF NOT EXISTS public.propostas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number text NOT NULL UNIQUE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  emitter_id text NOT NULL REFERENCES public.emitters(id),
  status public.proposal_status NOT NULL DEFAULT 'rascunho',
  validity_days integer NOT NULL DEFAULT 15,
  payment_term_id text REFERENCES public.condicoes_pagamento(id),
  discount_percent numeric NOT NULL DEFAULT 0,
  observations text NOT NULL DEFAULT '',
  transport jsonb NOT NULL DEFAULT '{}'::jsonb,
  approval_requested_at timestamptz,
  approval_reason text,
  approved_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  order_created_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS propostas_owner_idx ON public.propostas(owner_id);
CREATE INDEX IF NOT EXISTS propostas_lead_idx ON public.propostas(lead_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.propostas TO authenticated;
GRANT ALL ON public.propostas TO service_role;
ALTER TABLE public.propostas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "propostas owner select" ON public.propostas FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR has_role(auth.uid(), 'admin'));
CREATE POLICY "propostas owner insert" ON public.propostas FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid() OR has_role(auth.uid(), 'admin'));
CREATE POLICY "propostas owner update" ON public.propostas FOR UPDATE TO authenticated
  USING (owner_id = auth.uid() OR has_role(auth.uid(), 'admin'))
  WITH CHECK (owner_id = auth.uid() OR has_role(auth.uid(), 'admin'));
CREATE POLICY "propostas admin delete" ON public.propostas FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'));
CREATE TRIGGER propostas_updated_at BEFORE UPDATE ON public.propostas
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE IF NOT EXISTS public.proposta_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposta_id uuid NOT NULL REFERENCES public.propostas(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.produtos(id) ON DELETE SET NULL,
  sku text NOT NULL,
  description text NOT NULL,
  unit text NOT NULL DEFAULT 'Un',
  quantity numeric NOT NULL DEFAULT 0,
  unit_price numeric NOT NULL DEFAULT 0,
  position integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS proposta_itens_prop_idx ON public.proposta_itens(proposta_id, position);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.proposta_itens TO authenticated;
GRANT ALL ON public.proposta_itens TO service_role;
ALTER TABLE public.proposta_itens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "prop_itens via proposta" ON public.proposta_itens FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.propostas p WHERE p.id = proposta_id AND (p.owner_id = auth.uid() OR has_role(auth.uid(), 'admin'))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.propostas p WHERE p.id = proposta_id AND (p.owner_id = auth.uid() OR has_role(auth.uid(), 'admin'))));

CREATE TABLE IF NOT EXISTS public.proposta_parcelas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposta_id uuid NOT NULL REFERENCES public.propostas(id) ON DELETE CASCADE,
  days integer NOT NULL DEFAULT 0,
  amount numeric NOT NULL DEFAULT 0,
  notes text NOT NULL DEFAULT '',
  position integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS proposta_parcelas_prop_idx ON public.proposta_parcelas(proposta_id, position);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.proposta_parcelas TO authenticated;
GRANT ALL ON public.proposta_parcelas TO service_role;
ALTER TABLE public.proposta_parcelas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "parcelas via proposta" ON public.proposta_parcelas FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.propostas p WHERE p.id = proposta_id AND (p.owner_id = auth.uid() OR has_role(auth.uid(), 'admin'))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.propostas p WHERE p.id = proposta_id AND (p.owner_id = auth.uid() OR has_role(auth.uid(), 'admin'))));

CREATE TABLE IF NOT EXISTS public.pedidos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number text NOT NULL UNIQUE,
  proposta_id uuid REFERENCES public.propostas(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'novo',
  total numeric NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pedidos_owner_idx ON public.pedidos(owner_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pedidos TO authenticated;
GRANT ALL ON public.pedidos TO service_role;
ALTER TABLE public.pedidos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pedidos owner select" ON public.pedidos FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR has_role(auth.uid(), 'admin'));
CREATE POLICY "pedidos owner insert" ON public.pedidos FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid() OR has_role(auth.uid(), 'admin'));
CREATE POLICY "pedidos owner update" ON public.pedidos FOR UPDATE TO authenticated
  USING (owner_id = auth.uid() OR has_role(auth.uid(), 'admin'))
  WITH CHECK (owner_id = auth.uid() OR has_role(auth.uid(), 'admin'));
CREATE POLICY "pedidos admin delete" ON public.pedidos FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'));
CREATE TRIGGER pedidos_updated_at BEFORE UPDATE ON public.pedidos
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE IF NOT EXISTS public.pedido_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id uuid NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.produtos(id) ON DELETE SET NULL,
  sku text NOT NULL,
  description text NOT NULL,
  unit text NOT NULL DEFAULT 'Un',
  quantity numeric NOT NULL DEFAULT 0,
  unit_price numeric NOT NULL DEFAULT 0,
  position integer NOT NULL DEFAULT 0
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pedido_itens TO authenticated;
GRANT ALL ON public.pedido_itens TO service_role;
ALTER TABLE public.pedido_itens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pedido_itens via pedido" ON public.pedido_itens FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.pedidos p WHERE p.id = pedido_id AND (p.owner_id = auth.uid() OR has_role(auth.uid(), 'admin'))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.pedidos p WHERE p.id = pedido_id AND (p.owner_id = auth.uid() OR has_role(auth.uid(), 'admin'))));

-- ============================================================
-- 8. Atendimento WhatsApp: conversas, mensagens, fila
-- ============================================================

CREATE TABLE IF NOT EXISTS public.whatsapp_conversas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL UNIQUE,
  name text,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  status public.conversa_status NOT NULL DEFAULT 'ia_atendendo',
  ia_ativa boolean NOT NULL DEFAULT true,
  last_message_preview text,
  last_message_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS whatsapp_conversas_status_idx ON public.whatsapp_conversas(status, last_message_at DESC);
CREATE INDEX IF NOT EXISTS whatsapp_conversas_lead_idx ON public.whatsapp_conversas(lead_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_conversas TO authenticated;
GRANT ALL ON public.whatsapp_conversas TO service_role;
ALTER TABLE public.whatsapp_conversas ENABLE ROW LEVEL SECURITY;

-- admin vê tudo; vendedor vê se lead é dele OU se ainda não tem lead (ia_atendendo sem dono)
CREATE POLICY "conversas select" ON public.whatsapp_conversas FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_id AND l.owner_id = auth.uid())
  );
CREATE POLICY "conversas update owner or admin" ON public.whatsapp_conversas FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_id AND l.owner_id = auth.uid())
  );

CREATE TRIGGER whatsapp_conversas_updated_at BEFORE UPDATE ON public.whatsapp_conversas
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE IF NOT EXISTS public.whatsapp_mensagens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_id uuid NOT NULL REFERENCES public.whatsapp_conversas(id) ON DELETE CASCADE,
  direcao public.msg_direcao NOT NULL,
  autor public.msg_autor NOT NULL,
  conteudo text NOT NULL,
  external_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS whatsapp_mensagens_conversa_idx ON public.whatsapp_mensagens(conversa_id, created_at ASC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_mensagens TO authenticated;
GRANT ALL ON public.whatsapp_mensagens TO service_role;
ALTER TABLE public.whatsapp_mensagens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mensagens select via conversa" ON public.whatsapp_mensagens FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.whatsapp_conversas c
    WHERE c.id = conversa_id AND (
      has_role(auth.uid(), 'admin')
      OR EXISTS (SELECT 1 FROM public.leads l WHERE l.id = c.lead_id AND l.owner_id = auth.uid())
    )
  ));
CREATE POLICY "mensagens insert via conversa" ON public.whatsapp_mensagens FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.whatsapp_conversas c
    WHERE c.id = conversa_id AND (
      has_role(auth.uid(), 'admin')
      OR EXISTS (SELECT 1 FROM public.leads l WHERE l.id = c.lead_id AND l.owner_id = auth.uid())
    )
  ));

-- Trigger: mensagem de cliente atualiza conversa e last_interaction do lead
CREATE OR REPLACE FUNCTION public.tg_touch_conversa()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE _lead uuid;
BEGIN
  UPDATE public.whatsapp_conversas
    SET last_message_at = NEW.created_at,
        last_message_preview = LEFT(NEW.conteudo, 200),
        updated_at = now()
    WHERE id = NEW.conversa_id
    RETURNING lead_id INTO _lead;
  IF _lead IS NOT NULL AND NEW.autor = 'cliente' THEN
    UPDATE public.leads SET last_interaction_at = NEW.created_at WHERE id = _lead;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER whatsapp_mensagens_touch
  AFTER INSERT ON public.whatsapp_mensagens
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_conversa();

-- fila_vendedores (round-robin)
CREATE TABLE IF NOT EXISTS public.fila_vendedores (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  posicao integer NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.fila_vendedores TO authenticated;
GRANT ALL ON public.fila_vendedores TO service_role;
ALTER TABLE public.fila_vendedores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fila read authenticated" ON public.fila_vendedores FOR SELECT TO authenticated USING (true);
CREATE POLICY "fila admin write" ON public.fila_vendedores FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
CREATE TRIGGER fila_updated_at BEFORE UPDATE ON public.fila_vendedores
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- estado global do round-robin (cursor)
CREATE TABLE IF NOT EXISTS public.fila_estado (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  ultimo_user_id uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.fila_estado(id) VALUES (1) ON CONFLICT DO NOTHING;
GRANT SELECT ON public.fila_estado TO authenticated;
GRANT ALL ON public.fila_estado TO service_role;
ALTER TABLE public.fila_estado ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fila_estado read" ON public.fila_estado FOR SELECT TO authenticated USING (true);

-- Função atribuir_proximo_vendedor
CREATE OR REPLACE FUNCTION public.atribuir_proximo_vendedor(_lead_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _next uuid;
  _last uuid;
BEGIN
  SELECT ultimo_user_id INTO _last FROM public.fila_estado WHERE id = 1 FOR UPDATE;

  -- próximo após o último (posicao > última posicao)
  SELECT f.user_id INTO _next
    FROM public.fila_vendedores f
    WHERE f.ativo = true
      AND (_last IS NULL OR f.posicao > (SELECT posicao FROM public.fila_vendedores WHERE user_id = _last))
    ORDER BY f.posicao ASC
    LIMIT 1;

  IF _next IS NULL THEN
    -- ciclo: volta ao primeiro ativo
    SELECT f.user_id INTO _next
      FROM public.fila_vendedores f
      WHERE f.ativo = true
      ORDER BY f.posicao ASC
      LIMIT 1;
  END IF;

  IF _next IS NULL THEN
    RAISE EXCEPTION 'Nenhum vendedor ativo na fila';
  END IF;

  UPDATE public.fila_estado SET ultimo_user_id = _next, updated_at = now() WHERE id = 1;

  UPDATE public.leads
    SET owner_id = _next,
        stage = 'qualificacao',
        updated_at = now()
    WHERE id = _lead_id;

  UPDATE public.whatsapp_conversas
    SET status = 'qualificado',
        ia_ativa = false,
        updated_at = now()
    WHERE lead_id = _lead_id;

  RETURN _next;
END; $$;

GRANT EXECUTE ON FUNCTION public.atribuir_proximo_vendedor(uuid) TO service_role;

-- ============================================================
-- 9. Xerife config (singleton)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.xerife_config (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  dias_sem_interacao_por_etapa jsonb NOT NULL DEFAULT '{"novo":1,"qualificacao":2,"proposta":3,"negociacao":2}'::jsonb,
  proposta_enviada_dias integer NOT NULL DEFAULT 3,
  tarefa_atrasada_horas integer NOT NULL DEFAULT 24,
  ia_sem_resposta_horas integer NOT NULL DEFAULT 2,
  resumo_diario_ativo boolean NOT NULL DEFAULT true,
  resumo_hora time NOT NULL DEFAULT '08:00',
  horario_comercial_inicio time NOT NULL DEFAULT '07:00',
  horario_comercial_fim time NOT NULL DEFAULT '20:00',
  ativo boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.xerife_config(id) VALUES (1) ON CONFLICT DO NOTHING;
GRANT SELECT ON public.xerife_config TO authenticated;
GRANT ALL ON public.xerife_config TO service_role;
ALTER TABLE public.xerife_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "xerife_config read authenticated" ON public.xerife_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "xerife_config admin write" ON public.xerife_config FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

-- ============================================================
-- 10. Realtime
-- ============================================================
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_conversas;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_mensagens;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.tarefas;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 11. Seed cadastros globais
-- ============================================================

INSERT INTO public.emitters (id, brand, tagline, legal_name, cnpj, ie, address, phone, whatsapp, email, website, is_default) VALUES
  ('taoplast','PALLET DE PLÁSTICO','Indústria e comércio de produtos plásticos','TAOPLAST Indústria e Comércio de Produtos Plásticos LTDA','00.000.000/0001-00','000.000.000.000','Av. Industrial, 1000 — Distrito Industrial — São Paulo/SP — CEP 00000-000','(11) 4000-0000','(11) 90000-0000','vendas@palletdeplastico.com.br','www.palletdeplastico.com.br', true),
  ('inplastic','INPLASTIC','Comércio de produtos plásticos','INPLASTIC Comércio de Produtos Plásticos LTDA – ME','19.959.992/0001-07','143.366.452.110','Rua Capitão Busse, 854 — Parque Edu Chaves — São Paulo/SP — CEP 02232-050','(11) 2372-2225','(11) 2372-2225','inplastic@inplastic.com.br','www.inplastic.com.br', false),
  ('licitaplas','LICITAPLAS','Comércio de plásticos','LICITAPLAS Comércio de Plásticos LTDA (Limitada Unipessoal – ME)','39.871.995/0001-00','—','Rua Luis Sergio Person, 223 — Parque Mandaqui — São Paulo/SP — CEP 02422-230','(11) 2372-2225','(11) 2372-2225','contato@licitaplas.com.br','www.licitaplas.com.br', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.produtos (sku, name, description, unit, weight_kg, height_cm, width_cm, length_cm, ncm, default_price, active) VALUES
  ('PBR-1210','Pallet PBR 1210 Preto','Pallet plástico padrão PBR 1000x1200mm, cor preta, alta resistência.','Un',18,14,100,120,'3923.10.90',185,true),
  ('EXP-1210','Pallet Exportação 1210','Pallet plástico para exportação, dispensa NIMF-15, empilhável.','Un',16,15,100,120,'3923.10.90',210,true),
  ('HIG-1210','Pallet Higiênico 1210','Pallet higiênico para frigoríficos e farmacêutica, superfície fechada.','Un',22,15,100,120,'3923.10.90',245,true),
  ('REF-1210','Pallet Reforçado 1210','Pallet reforçado para cargas até 2.000 kg, indústria pesada.','Un',25,15,100,120,'3923.10.90',275,true)
ON CONFLICT (sku) DO NOTHING;

INSERT INTO public.condicoes_pagamento (id, label, method, splits, notes, active) VALUES
  ('pix-avista','PIX à vista','PIX','[0]','Com 3% de desconto',true),
  ('pix-7','PIX 7 dias','PIX','[7]',NULL,true),
  ('pix-14','PIX 14 dias','PIX','[14]',NULL,true),
  ('pix-28','PIX 28 dias','PIX','[28]',NULL,true),
  ('dinheiro-avista','Dinheiro à vista','Dinheiro','[0]','Com 5% de desconto',true),
  ('dep-avista','Depósito em Conta à vista','Depósito em Conta','[0]',NULL,true),
  ('dep-15','Depósito em Conta 15 dias','Depósito em Conta','[15]',NULL,true),
  ('boleto-avista','Boleto à vista','Boleto','[0]',NULL,true),
  ('boleto-14','Boleto 14 dias','Boleto','[14]',NULL,true),
  ('boleto-21','Boleto 21 dias','Boleto','[21]',NULL,true),
  ('boleto-28','Boleto 28 dias','Boleto','[28]',NULL,true),
  ('boleto-30','Boleto 30 dias','Boleto','[30]',NULL,true),
  ('boleto-2x-30-60','Boleto 2x — 30/60 dias','Boleto','[30,60]',NULL,true),
  ('boleto-3x-30-60-90','Boleto 3x — 30/60/90 dias','Boleto','[30,60,90]',NULL,true),
  ('boleto-4x','Boleto 4x — 30/60/90/120 dias','Boleto','[30,60,90,120]',NULL,true),
  ('boleto-6x','Boleto 6x — 30 a 180 dias','Boleto','[30,60,90,120,150,180]',NULL,true),
  ('boleto-entrada-30','Boleto — entrada + 30 dias','Boleto','[0,30]',NULL,true),
  ('cartao-avista','Cartão à vista','Cartão','[0]',NULL,true),
  ('cartao-3x','Cartão 3x sem juros','Cartão','[0,30,60]',NULL,true),
  ('cartao-6x','Cartão 6x sem juros','Cartão','[0,30,60,90,120,150]',NULL,true)
ON CONFLICT (id) DO NOTHING;
