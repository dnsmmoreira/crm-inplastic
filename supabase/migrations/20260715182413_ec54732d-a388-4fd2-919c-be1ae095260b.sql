
-- =========================================
-- Leads: empresa, dados fiscais, condições comerciais e rastreio Omie
-- =========================================
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS empresa text
    CHECK (empresa IN ('INPLASTIC','TAOPLAST','LICITAPLAS')),
  ADD COLUMN IF NOT EXISTS razao_social text,
  ADD COLUMN IF NOT EXISTS nome_fantasia text,
  ADD COLUMN IF NOT EXISTS cnpj text,
  ADD COLUMN IF NOT EXISTS inscricao_estadual text,
  ADD COLUMN IF NOT EXISTS endereco text,
  ADD COLUMN IF NOT EXISTS numero text,
  ADD COLUMN IF NOT EXISTS complemento text,
  ADD COLUMN IF NOT EXISTS bairro text,
  ADD COLUMN IF NOT EXISTS cep text,
  ADD COLUMN IF NOT EXISTS cidade text,
  ADD COLUMN IF NOT EXISTS estado text,
  ADD COLUMN IF NOT EXISTS telefone2 text,
  ADD COLUMN IF NOT EXISTS observacao_cliente text,
  ADD COLUMN IF NOT EXISTS codigo_parcela text,
  ADD COLUMN IF NOT EXISTS data_previsao_entrega date,
  ADD COLUMN IF NOT EXISTS modalidade_frete text,
  ADD COLUMN IF NOT EXISTS valor_frete numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS desconto_pedido numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS observacoes_venda text,
  ADD COLUMN IF NOT EXISTS omie_codigo_pedido bigint,
  ADD COLUMN IF NOT EXISTS omie_numero_pedido text,
  ADD COLUMN IF NOT EXISTS omie_codigo_cliente bigint,
  ADD COLUMN IF NOT EXISTS omie_status text,
  ADD COLUMN IF NOT EXISTS omie_erro text,
  ADD COLUMN IF NOT EXISTS omie_enviado_em timestamptz;

-- Vínculo opcional para o catálogo Omie
ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS codigo_produto_omie bigint;

-- =========================================
-- produtos_omie (catálogo espelho)
-- =========================================
CREATE TABLE IF NOT EXISTS public.produtos_omie (
  codigo_produto bigint PRIMARY KEY,
  codigo text,
  descricao text NOT NULL,
  descricao_familia text,
  unidade text,
  ncm text,
  valor_unitario numeric DEFAULT 0,
  marca text,
  inativo boolean DEFAULT false,
  bloqueado boolean DEFAULT false,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.produtos_omie TO authenticated;
GRANT ALL ON public.produtos_omie TO service_role;

ALTER TABLE public.produtos_omie ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read produtos_omie"
  ON public.produtos_omie FOR SELECT
  TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_produtos_omie_desc
  ON public.produtos_omie
  USING gin (to_tsvector('portuguese', descricao));
CREATE INDEX IF NOT EXISTS idx_produtos_omie_codigo
  ON public.produtos_omie(codigo);

-- =========================================
-- lead_itens (itens do pedido)
-- =========================================
CREATE TABLE IF NOT EXISTS public.lead_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  codigo_produto bigint NOT NULL,
  descricao text NOT NULL,
  unidade text,
  quantidade numeric NOT NULL CHECK (quantidade > 0),
  valor_unitario numeric NOT NULL CHECK (valor_unitario >= 0),
  desconto_percentual numeric DEFAULT 0
    CHECK (desconto_percentual >= 0 AND desconto_percentual <= 100),
  desconto_valor numeric DEFAULT 0 CHECK (desconto_valor >= 0),
  valor_total numeric GENERATED ALWAYS AS (
    quantidade * valor_unitario * (1 - COALESCE(desconto_percentual,0)/100)
      - COALESCE(desconto_valor,0)
  ) STORED,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_itens TO authenticated;
GRANT ALL ON public.lead_itens TO service_role;

ALTER TABLE public.lead_itens ENABLE ROW LEVEL SECURITY;

-- Acesso segue o mesmo do lead (admin vê tudo; vendedor vê o próprio)
CREATE POLICY "lead_itens select follow lead"
  ON public.lead_itens FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.id = lead_itens.lead_id
      AND (public.has_role(auth.uid(),'admin'::public.app_role) OR l.owner_id = auth.uid())
  ));

CREATE POLICY "lead_itens insert follow lead"
  ON public.lead_itens FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.id = lead_itens.lead_id
      AND (public.has_role(auth.uid(),'admin'::public.app_role) OR l.owner_id = auth.uid())
  ));

CREATE POLICY "lead_itens update follow lead"
  ON public.lead_itens FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.id = lead_itens.lead_id
      AND (public.has_role(auth.uid(),'admin'::public.app_role) OR l.owner_id = auth.uid())
  ));

CREATE POLICY "lead_itens delete follow lead"
  ON public.lead_itens FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.id = lead_itens.lead_id
      AND (public.has_role(auth.uid(),'admin'::public.app_role) OR l.owner_id = auth.uid())
  ));

CREATE INDEX IF NOT EXISTS idx_lead_itens_lead_id
  ON public.lead_itens(lead_id);
