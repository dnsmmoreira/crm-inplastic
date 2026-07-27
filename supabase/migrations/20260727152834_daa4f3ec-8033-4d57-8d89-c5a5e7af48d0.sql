-- 1. ENUM pedido_stage (idempotente)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pedido_stage') THEN
    CREATE TYPE public.pedido_stage AS ENUM (
      'pedido_recebido',
      'em_validacao',
      'aguardando_aprovacao',
      'aprovado_programado',
      'em_producao',
      'separacao_conferencia',
      'faturado_aguardando_coleta',
      'despachado_transporte',
      'pedido_entregue',
      'concluido'
    );
  END IF;
END $$;

-- 2. Coluna stage + demais colunas aditivas (todas IF NOT EXISTS, nullable)
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS stage public.pedido_stage NOT NULL DEFAULT 'pedido_recebido',
  -- Responsáveis
  ADD COLUMN IF NOT EXISTS vendedor_proprietario_id uuid,
  ADD COLUMN IF NOT EXISTS equipe_responsavel text,
  ADD COLUMN IF NOT EXISTS responsavel_atual_id uuid,
  -- Snapshot
  ADD COLUMN IF NOT EXISTS proposta_snapshot jsonb,
  -- Programação
  ADD COLUMN IF NOT EXISTS forma_atendimento text,
  ADD COLUMN IF NOT EXISTS prioridade text,
  ADD COLUMN IF NOT EXISTS previsao_entrega timestamptz,
  -- Fiscais
  ADD COLUMN IF NOT EXISTS fiscal_status text DEFAULT 'nao_iniciado',
  ADD COLUMN IF NOT EXISTS nf_numero text,
  ADD COLUMN IF NOT EXISTS nf_serie text,
  ADD COLUMN IF NOT EXISTS nf_chave text,
  ADD COLUMN IF NOT EXISTS nf_valor numeric,
  ADD COLUMN IF NOT EXISTS nf_emitida_em timestamptz,
  ADD COLUMN IF NOT EXISTS nf_pdf_url text,
  ADD COLUMN IF NOT EXISTS nf_xml_url text,
  -- Transporte/entrega
  ADD COLUMN IF NOT EXISTS transportadora text,
  ADD COLUMN IF NOT EXISTS motorista text,
  ADD COLUMN IF NOT EXISTS placa text,
  ADD COLUMN IF NOT EXISTS despachado_em timestamptz,
  ADD COLUMN IF NOT EXISTS entregue_em timestamptz,
  ADD COLUMN IF NOT EXISTS entrega_recebida_por text,
  ADD COLUMN IF NOT EXISTS ocorrencia text,
  -- Pós-venda
  ADD COLUMN IF NOT EXISTS pos_venda_status text DEFAULT 'nao_iniciado';

-- 3. Numeração PED-YYYY-0001 (espelho de next_proposta_number)
CREATE OR REPLACE FUNCTION public.next_pedido_number(_year integer)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _next int;
  _prefix text := 'PED-' || _year::text || '-';
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('pedido_number_' || _year::text));
  SELECT COALESCE(MAX(NULLIF(substring(number FROM (char_length(_prefix) + 1)), '')::int), 0) + 1
    INTO _next
  FROM public.pedidos
  WHERE number LIKE _prefix || '%'
    AND substring(number FROM (char_length(_prefix) + 1)) ~ '^\d+$';
  RETURN _prefix || lpad(_next::text, 4, '0');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.next_pedido_number(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_pedido_number(integer) TO authenticated, service_role;