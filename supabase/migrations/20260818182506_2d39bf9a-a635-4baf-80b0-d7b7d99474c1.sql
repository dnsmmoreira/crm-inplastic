CREATE TABLE public.arena_config (
  id                       int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  custo_interno_teto_pct   numeric NOT NULL DEFAULT 7,
  comissao_logiscal_pct    numeric NOT NULL DEFAULT 5,
  comissao_kelly_pct       numeric NOT NULL DEFAULT 0.5,
  encargos_fator           numeric NOT NULL DEFAULT 1.70,
  base_calculo_default     text    NOT NULL DEFAULT 'recebido'
                             CHECK (base_calculo_default IN ('recebido','faturado')),
  base_calculo_logiscal    text    NOT NULL DEFAULT 'recebido'
                             CHECK (base_calculo_logiscal IN ('recebido','faturado')),
  margem_minima_pct        numeric NOT NULL DEFAULT 0,
  piso_preco_pct           numeric NOT NULL DEFAULT 0,
  arena_orcamento_mensal   numeric NOT NULL DEFAULT 0,
  arena_cap_temporada      numeric NOT NULL DEFAULT 5000,
  carencia_meses_default   int     NOT NULL DEFAULT 6 CHECK (carencia_meses_default >= 0),
  rampa_metas              jsonb   NOT NULL DEFAULT '[85000,120000,150000,175000]'::jsonb,
  meta_canal_representante numeric NOT NULL DEFAULT 150000,
  temporada_inicio         date    NOT NULL DEFAULT DATE '2026-09-01',
  rodada_piso_ativo        boolean NOT NULL DEFAULT false,
  rodada_piso_pace_pct     numeric NOT NULL DEFAULT 50,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, UPDATE ON public.arena_config TO authenticated;
GRANT ALL ON public.arena_config TO service_role;

ALTER TABLE public.arena_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY arena_config_select_admin ON public.arena_config
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role));

CREATE POLICY arena_config_update_admin ON public.arena_config
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));

CREATE TRIGGER arena_config_updated_at
  BEFORE UPDATE ON public.arena_config
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

INSERT INTO public.arena_config (
  id, custo_interno_teto_pct, comissao_logiscal_pct, comissao_kelly_pct, encargos_fator,
  base_calculo_default, base_calculo_logiscal, margem_minima_pct, piso_preco_pct,
  arena_orcamento_mensal, arena_cap_temporada, carencia_meses_default, rampa_metas,
  meta_canal_representante, temporada_inicio, rodada_piso_ativo, rodada_piso_pace_pct
) VALUES (
  1, 7, 5, 0.5, 1.70,
  'recebido', 'recebido', 0, 0,
  3150, 5000, 6, '[85000,120000,150000,175000]'::jsonb,
  150000, DATE '2026-09-01', false, 50
) ON CONFLICT (id) DO NOTHING;