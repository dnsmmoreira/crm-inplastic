-- ============ B0: estruturas ARENA ============

-- 0. Colunas adicionais de configuracao (margem C1 + equilibrio B5)
ALTER TABLE public.arena_config
  ADD COLUMN IF NOT EXISTS margem_piso_comercial_pct numeric NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS custo_produto_pct_estimado numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS interno_custo_fixo_mensal numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS interno_custo_variavel_pct numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS rep_custo_fixo_incremental_mensal numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rep_custo_variavel_pct numeric NOT NULL DEFAULT 5.5;

COMMENT ON COLUMN public.arena_config.margem_piso_comercial_pct IS
  'Piso comercial de margem configuravel, usado enquanto nao ha custo de produto no banco.';
COMMENT ON COLUMN public.arena_config.custo_produto_pct_estimado IS
  'Custo estimado de produto em % da receita, usado no calculo de margem de contribuicao. 0 = ainda nao parametrizado.';

-- 1. Custos comerciais mensais
CREATE TABLE public.arena_custo_mensal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ano integer NOT NULL,
  mes integer NOT NULL CHECK (mes BETWEEN 1 AND 12),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  canal text NOT NULL DEFAULT 'interno',
  categoria text NOT NULL,
  valor numeric NOT NULL DEFAULT 0,
  formacao boolean NOT NULL DEFAULT false,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON COLUMN public.arena_custo_mensal.formacao IS
  'true = custo de investimento em formacao (vendedor em carencia), separado da ineficiencia.';
CREATE INDEX arena_custo_mensal_periodo_idx ON public.arena_custo_mensal (ano, mes);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.arena_custo_mensal TO authenticated;
GRANT ALL ON public.arena_custo_mensal TO service_role;
ALTER TABLE public.arena_custo_mensal ENABLE ROW LEVEL SECURITY;
CREATE POLICY "arena_custo_admin_all" ON public.arena_custo_mensal
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 2. Receita mensal (faturado x recebido)
CREATE TABLE public.arena_receita_mensal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ano integer NOT NULL,
  mes integer NOT NULL CHECK (mes BETWEEN 1 AND 12),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  canal text NOT NULL DEFAULT 'interno',
  valor_faturado numeric NOT NULL DEFAULT 0,
  valor_recebido numeric NOT NULL DEFAULT 0,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ano, mes, user_id, canal)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.arena_receita_mensal TO authenticated;
GRANT ALL ON public.arena_receita_mensal TO service_role;
ALTER TABLE public.arena_receita_mensal ENABLE ROW LEVEL SECURITY;
CREATE POLICY "arena_receita_admin_all" ON public.arena_receita_mensal
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 3. Licitacoes (bolso 2 da Kelly)
CREATE TABLE public.arena_licitacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  orgao text NOT NULL,
  objeto text NOT NULL DEFAULT '',
  modalidade text,
  numero text,
  situacao text NOT NULL DEFAULT 'identificada',
  valor_estimado numeric NOT NULL DEFAULT 0,
  valor_proposto numeric NOT NULL DEFAULT 0,
  valor_homologado numeric NOT NULL DEFAULT 0,
  valor_empenhado numeric NOT NULL DEFAULT 0,
  valor_recebido numeric NOT NULL DEFAULT 0,
  data_identificacao date,
  data_habilitacao date,
  data_pregao date,
  data_homologacao date,
  data_empenho date,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON COLUMN public.arena_licitacoes.situacao IS
  'identificada | habilitacao | proposta | pregao | vitoria | empenho | recebida | perdida';
CREATE INDEX arena_licitacoes_user_idx ON public.arena_licitacoes (user_id, situacao);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.arena_licitacoes TO authenticated;
GRANT ALL ON public.arena_licitacoes TO service_role;
ALTER TABLE public.arena_licitacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "arena_licitacoes_admin_all" ON public.arena_licitacoes
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "arena_licitacoes_owner_select" ON public.arena_licitacoes
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- 4. Aprovacao Extraordinaria da Diretoria (C2)
CREATE TABLE public.arena_aprovacoes_extraordinarias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposta_id uuid NOT NULL REFERENCES public.propostas(id) ON DELETE CASCADE,
  solicitante_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  motivo text NOT NULL,
  margem_original_pct numeric,
  margem_proposta_pct numeric,
  margem_minima_pct numeric,
  desconto_percent numeric,
  status text NOT NULL DEFAULT 'pendente',
  aprovador_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decidido_em timestamptz,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON COLUMN public.arena_aprovacoes_extraordinarias.status IS 'pendente | aprovada | recusada';
CREATE INDEX arena_aprov_extra_proposta_idx ON public.arena_aprovacoes_extraordinarias (proposta_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.arena_aprovacoes_extraordinarias TO authenticated;
GRANT ALL ON public.arena_aprovacoes_extraordinarias TO service_role;
ALTER TABLE public.arena_aprovacoes_extraordinarias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "arena_aprov_extra_admin_all" ON public.arena_aprovacoes_extraordinarias
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "arena_aprov_extra_solicitante_select" ON public.arena_aprovacoes_extraordinarias
  FOR SELECT TO authenticated
  USING (solicitante_id = auth.uid());
CREATE POLICY "arena_aprov_extra_solicitante_insert" ON public.arena_aprovacoes_extraordinarias
  FOR INSERT TO authenticated
  WITH CHECK (solicitante_id = auth.uid() AND status = 'pendente');

-- 5. Log unificado de auditoria ARENA (D1)
CREATE TABLE public.arena_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ator_user_id uuid,
  alvo_user_id uuid,
  entidade text NOT NULL,
  entidade_id text,
  campo text NOT NULL,
  valor_anterior text,
  valor_novo text,
  motivo text,
  criado_em timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.arena_audit_log IS
  'Log unificado ARENA: meta, percentuais, comissoes, margem minima, teto, carencia, aprovacao extraordinaria e arena_config. Sempre com motivo quando informado.';
CREATE INDEX arena_audit_log_entidade_idx ON public.arena_audit_log (entidade, criado_em DESC);

GRANT SELECT ON public.arena_audit_log TO authenticated;
GRANT ALL ON public.arena_audit_log TO service_role;
ALTER TABLE public.arena_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "arena_audit_admin_select" ON public.arena_audit_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 6. Triggers de updated_at
CREATE TRIGGER arena_custo_mensal_touch BEFORE UPDATE ON public.arena_custo_mensal
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER arena_receita_mensal_touch BEFORE UPDATE ON public.arena_receita_mensal
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER arena_licitacoes_touch BEFORE UPDATE ON public.arena_licitacoes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER arena_aprov_extra_touch BEFORE UPDATE ON public.arena_aprovacoes_extraordinarias
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();