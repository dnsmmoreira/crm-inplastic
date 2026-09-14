-- 1) Quem pode acessar a ficha: mesmo escopo de quem já enxerga/move o pedido
CREATE OR REPLACE FUNCTION public.pode_acessar_ficha_pedido(_pedido_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.pedidos p
    WHERE p.id = _pedido_id
      AND (
        p.owner_id = auth.uid()
        OR p.vendedor_proprietario_id = auth.uid()
        OR has_role(auth.uid(), 'admin'::app_role)
        OR tem_permissao(auth.uid(), 'pedidos.movimentar')
        OR tem_permissao(auth.uid(), 'pedidos.operar_producao')
        OR tem_permissao(auth.uid(), 'pedidos.ver_todos')
      )
  )
$$;

REVOKE EXECUTE ON FUNCTION public.pode_acessar_ficha_pedido(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pode_acessar_ficha_pedido(uuid) TO authenticated, service_role;

-- 2) Numeração COL-AAAA-NNNNNN (espelho de next_pedido_number)
CREATE TABLE public.fichas_coleta (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero text NOT NULL UNIQUE,
  pedido_id uuid NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
  emitter_id text REFERENCES public.emitters(id),
  status text NOT NULL DEFAULT 'rascunho'
    CHECK (status IN ('rascunho','emitida','em_coleta','coletada','cancelada')),
  transportadora_id uuid REFERENCES public.transportadoras(id),
  transportadora_nome text,
  modalidade_entrega text,
  contato_nome text,
  contato_telefone text,
  previsao_coleta_data date,
  previsao_coleta_hora text,
  motorista text,
  placa text,
  volumes text,
  observacoes text,
  peso_total_kg numeric(14,3) NOT NULL DEFAULT 0,
  cubagem_m3 numeric(14,4) NOT NULL DEFAULT 0,
  snapshot jsonb,
  emitida_em timestamptz,
  emitida_por uuid,
  em_coleta_em timestamptz,
  coletada_em timestamptz,
  coletada_por uuid,
  cancelada_em timestamptz,
  cancelada_por uuid,
  cancelamento_motivo text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX fichas_coleta_pedido_idx ON public.fichas_coleta (pedido_id);
CREATE INDEX fichas_coleta_status_idx ON public.fichas_coleta (status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fichas_coleta TO authenticated;
GRANT ALL ON public.fichas_coleta TO service_role;
ALTER TABLE public.fichas_coleta ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fichas_coleta via pedido" ON public.fichas_coleta
  FOR ALL TO authenticated
  USING (public.pode_acessar_ficha_pedido(pedido_id))
  WITH CHECK (public.pode_acessar_ficha_pedido(pedido_id));

CREATE TRIGGER trg_fichas_coleta_updated_at
  BEFORE UPDATE ON public.fichas_coleta
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 3) Itens da ficha (válidos enquanto rascunho; depois vale o snapshot)
CREATE TABLE public.ficha_coleta_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ficha_id uuid NOT NULL REFERENCES public.fichas_coleta(id) ON DELETE CASCADE,
  produto_id uuid,
  sku text,
  descricao text NOT NULL DEFAULT '',
  quantidade numeric(14,3) NOT NULL DEFAULT 0,
  unidade text,
  peso_kg numeric(14,3),
  cubagem_m3 numeric(14,4),
  peso_manual boolean NOT NULL DEFAULT false,
  cubagem_manual boolean NOT NULL DEFAULT false,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ficha_coleta_itens_ficha_idx ON public.ficha_coleta_itens (ficha_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ficha_coleta_itens TO authenticated;
GRANT ALL ON public.ficha_coleta_itens TO service_role;
ALTER TABLE public.ficha_coleta_itens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ficha_coleta_itens via ficha" ON public.ficha_coleta_itens
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.fichas_coleta f
                 WHERE f.id = ficha_coleta_itens.ficha_id
                   AND public.pode_acessar_ficha_pedido(f.pedido_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.fichas_coleta f
                 WHERE f.id = ficha_coleta_itens.ficha_id
                   AND public.pode_acessar_ficha_pedido(f.pedido_id)));

CREATE TRIGGER trg_ficha_coleta_itens_updated_at
  BEFORE UPDATE ON public.ficha_coleta_itens
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 4) Histórico da ficha (espelho de pedido_ocorrencias)
CREATE TABLE public.ficha_coleta_historico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ficha_id uuid NOT NULL REFERENCES public.fichas_coleta(id) ON DELETE CASCADE,
  tipo text NOT NULL,
  descricao text NOT NULL DEFAULT '',
  status_anterior text,
  status_novo text,
  criada_por uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ficha_coleta_historico_ficha_idx ON public.ficha_coleta_historico (ficha_id, created_at DESC);

GRANT SELECT, INSERT ON public.ficha_coleta_historico TO authenticated;
GRANT ALL ON public.ficha_coleta_historico TO service_role;
ALTER TABLE public.ficha_coleta_historico ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ficha_coleta_historico leitura" ON public.ficha_coleta_historico
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.fichas_coleta f
                 WHERE f.id = ficha_coleta_historico.ficha_id
                   AND public.pode_acessar_ficha_pedido(f.pedido_id)));

CREATE POLICY "ficha_coleta_historico insert" ON public.ficha_coleta_historico
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.fichas_coleta f
                 WHERE f.id = ficha_coleta_historico.ficha_id
                   AND public.pode_acessar_ficha_pedido(f.pedido_id)));

-- 5) Numeração sequencial com trava (nunca reaproveitada)
CREATE OR REPLACE FUNCTION public.next_ficha_coleta_number(_year integer)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _next int;
  _prefix text := 'COL-' || _year::text || '-';
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('ficha_coleta_number_' || _year::text));
  SELECT COALESCE(MAX(NULLIF(substring(numero FROM (char_length(_prefix) + 1)), '')::int), 0) + 1
    INTO _next
  FROM public.fichas_coleta
  WHERE numero LIKE _prefix || '%'
    AND substring(numero FROM (char_length(_prefix) + 1)) ~ '^\d+$';
  RETURN _prefix || lpad(_next::text, 6, '0');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.next_ficha_coleta_number(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_ficha_coleta_number(integer) TO authenticated, service_role;
