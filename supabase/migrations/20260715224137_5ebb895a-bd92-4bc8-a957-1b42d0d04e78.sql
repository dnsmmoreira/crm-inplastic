
-- Propostas: previsão de entrega + rastreio Omie
ALTER TABLE public.propostas
  ADD COLUMN IF NOT EXISTS expected_delivery_date date,
  ADD COLUMN IF NOT EXISTS omie_codigo_pedido bigint,
  ADD COLUMN IF NOT EXISTS omie_numero_pedido text,
  ADD COLUMN IF NOT EXISTS omie_codigo_cliente bigint,
  ADD COLUMN IF NOT EXISTS omie_status text CHECK (omie_status IN ('pendente','enviado','erro','nao_aplicavel')),
  ADD COLUMN IF NOT EXISTS omie_erro text,
  ADD COLUMN IF NOT EXISTS omie_enviado_em timestamptz;

-- Emitters: mapeamento p/ integração Omie
ALTER TABLE public.emitters
  ADD COLUMN IF NOT EXISTS omie_key text CHECK (omie_key IN ('INPLASTIC','TAOPLAST','LICITAPLAS'));

UPDATE public.emitters SET omie_key = 'INPLASTIC' WHERE id = 'inplastic' AND omie_key IS NULL;
UPDATE public.emitters SET omie_key = 'TAOPLAST'  WHERE id = 'taoplast'  AND omie_key IS NULL;
UPDATE public.emitters SET omie_key = 'LICITAPLAS' WHERE id = 'licitaplas' AND omie_key IS NULL;

COMMENT ON TABLE public.lead_itens IS
  'DEPRECADA (2026-07): itens agora vivem em proposta_itens vinculados via propostas.lead_id. Dados históricos preservados; não escrever novos registros.';
