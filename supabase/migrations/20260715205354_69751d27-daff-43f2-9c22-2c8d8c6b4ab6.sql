
-- ============================================================
-- Área "Clientes" — Fase A: schema + RLS + migração + vínculo
-- ============================================================

-- 1) Tabela clientes
CREATE TABLE IF NOT EXISTS public.clientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cnpj text NOT NULL UNIQUE,
  razao_social text NOT NULL,
  nome_fantasia text,
  inscricao_estadual text,
  ie_isento boolean NOT NULL DEFAULT false,
  endereco text,
  numero text,
  complemento text,
  bairro text,
  cep text,
  cidade text,
  estado text,
  contato text,
  email text,
  telefone text,
  telefone2 text,
  website text,
  observacao text,
  empresa_padrao text,
  vendedor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  criado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  ativo boolean NOT NULL DEFAULT true,
  omie_codigo_cliente_inplastic bigint,
  omie_codigo_cliente_taoplast bigint,
  CONSTRAINT clientes_cnpj_digitos CHECK (cnpj ~ '^[0-9]{14}$'),
  CONSTRAINT clientes_estado_uf CHECK (estado IS NULL OR estado ~ '^[A-Z]{2}$'),
  CONSTRAINT clientes_empresa_padrao_chk CHECK (empresa_padrao IS NULL OR empresa_padrao IN ('INPLASTIC','TAOPLAST','LICITAPLAS')),
  CONSTRAINT clientes_razao_nao_cliente CHECK (razao_social !~* '^cliente[[:space:]]')
);

CREATE INDEX IF NOT EXISTS idx_clientes_vendedor ON public.clientes(vendedor_id);
CREATE INDEX IF NOT EXISTS idx_clientes_cnpj ON public.clientes(cnpj);
CREATE INDEX IF NOT EXISTS idx_clientes_ativo ON public.clientes(ativo) WHERE ativo = true;
CREATE INDEX IF NOT EXISTS idx_clientes_razao_trgm ON public.clientes USING gin (to_tsvector('portuguese', razao_social));
CREATE INDEX IF NOT EXISTS idx_clientes_fantasia_trgm ON public.clientes USING gin (to_tsvector('portuguese', coalesce(nome_fantasia, '')));

-- 2) GRANTs (Data API)
GRANT SELECT, INSERT, UPDATE ON public.clientes TO authenticated;
GRANT ALL ON public.clientes TO service_role;

-- 3) Trigger atualizado_em
CREATE OR REPLACE FUNCTION public.tg_clientes_touch_atualizado_em()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.atualizado_em = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS clientes_atualizado_em ON public.clientes;
CREATE TRIGGER clientes_atualizado_em
  BEFORE UPDATE ON public.clientes
  FOR EACH ROW EXECUTE FUNCTION public.tg_clientes_touch_atualizado_em();

-- 4) RLS: vendedor vê os próprios; admin vê todos; ninguém deleta
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clientes_select_dono_ou_admin"
  ON public.clientes FOR SELECT TO authenticated
  USING (vendedor_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "clientes_insert_dono_ou_admin"
  ON public.clientes FOR INSERT TO authenticated
  WITH CHECK (
    (vendedor_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
    AND (criado_por = auth.uid() OR criado_por IS NULL)
  );

CREATE POLICY "clientes_update_dono_ou_admin"
  ON public.clientes FOR UPDATE TO authenticated
  USING (vendedor_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (vendedor_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Sem policy de DELETE => bloqueia deleção (só desativa via ativo=false)

-- 5) Vínculo em leads
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_leads_cliente ON public.leads(cliente_id);

-- 6) Migração de dados: extrai clientes únicos dos leads existentes
WITH src AS (
  SELECT
    regexp_replace(l.cnpj, '\D', '', 'g') AS cnpj_norm,
    l.razao_social,
    l.nome_fantasia,
    l.inscricao_estadual,
    NULLIF(btrim(coalesce(l.endereco->>'logradouro', '')), '') AS endereco,
    NULLIF(btrim(coalesce(l.numero, l.endereco->>'numero', '')), '') AS numero,
    NULLIF(btrim(coalesce(l.complemento, l.endereco->>'complemento', '')), '') AS complemento,
    NULLIF(btrim(coalesce(l.bairro, l.endereco->>'bairro', '')), '') AS bairro,
    NULLIF(btrim(coalesce(l.cep, l.endereco->>'cep', '')), '') AS cep,
    NULLIF(btrim(coalesce(l.cidade, l.endereco->>'cidade', '')), '') AS cidade,
    upper(NULLIF(btrim(coalesce(l.estado, l.endereco->>'uf', '')), '')) AS estado,
    NULLIF(btrim(coalesce(l.decisor_nome, l.contact_name, '')), '') AS contato,
    l.email,
    NULLIF(btrim(coalesce(l.telefone_fixo, l.telefone_whatsapp, l.whatsapp, '')), '') AS telefone,
    l.telefone2,
    l.observacao_cliente,
    CASE WHEN l.empresa IN ('INPLASTIC','TAOPLAST','LICITAPLAS') THEN l.empresa END AS empresa_padrao,
    l.owner_id AS vendedor_id,
    l.omie_codigo_cliente,
    l.created_at,
    row_number() OVER (
      PARTITION BY regexp_replace(l.cnpj, '\D', '', 'g')
      ORDER BY l.created_at ASC, l.id
    ) AS rn
  FROM public.leads l
  WHERE l.cnpj IS NOT NULL
    AND btrim(coalesce(l.razao_social, '')) <> ''
    AND l.razao_social !~* '^cliente[[:space:]]'
    AND length(regexp_replace(l.cnpj, '\D', '', 'g')) = 14
)
INSERT INTO public.clientes (
  cnpj, razao_social, nome_fantasia, inscricao_estadual,
  endereco, numero, complemento, bairro, cep, cidade, estado,
  contato, email, telefone, telefone2, observacao,
  empresa_padrao, vendedor_id,
  omie_codigo_cliente_inplastic, omie_codigo_cliente_taoplast,
  criado_em
)
SELECT
  cnpj_norm, razao_social, nome_fantasia, inscricao_estadual,
  endereco, numero, complemento, bairro, cep, cidade,
  CASE WHEN estado ~ '^[A-Z]{2}$' THEN estado END,
  contato, email, telefone, telefone2, observacao_cliente,
  empresa_padrao, vendedor_id,
  CASE WHEN empresa_padrao = 'INPLASTIC' THEN omie_codigo_cliente END,
  CASE WHEN empresa_padrao = 'TAOPLAST'  THEN omie_codigo_cliente END,
  created_at
FROM src
WHERE rn = 1
ON CONFLICT (cnpj) DO NOTHING;

-- 7) Popular leads.cliente_id
UPDATE public.leads l
SET cliente_id = c.id
FROM public.clientes c
WHERE l.cliente_id IS NULL
  AND l.cnpj IS NOT NULL
  AND length(regexp_replace(l.cnpj, '\D', '', 'g')) = 14
  AND regexp_replace(l.cnpj, '\D', '', 'g') = c.cnpj;
