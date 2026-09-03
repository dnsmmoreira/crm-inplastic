BEGIN;

DROP TABLE IF EXISTS public.produtos_omie;

ALTER TABLE public.produtos  DROP COLUMN IF EXISTS codigo_produto_omie;

ALTER TABLE public.clientes  DROP COLUMN IF EXISTS omie_codigo_cliente_inplastic,
                             DROP COLUMN IF EXISTS omie_codigo_cliente_taoplast;

ALTER TABLE public.emitters  DROP COLUMN IF EXISTS omie_key;

ALTER TABLE public.propostas DROP COLUMN IF EXISTS omie_status,
                             DROP COLUMN IF EXISTS omie_numero_pedido,
                             DROP COLUMN IF EXISTS omie_codigo_pedido,
                             DROP COLUMN IF EXISTS omie_erro,
                             DROP COLUMN IF EXISTS omie_enviado_em,
                             DROP COLUMN IF EXISTS omie_codigo_cliente;

ALTER TABLE public.leads     DROP COLUMN IF EXISTS omie_status,
                             DROP COLUMN IF EXISTS omie_numero_pedido,
                             DROP COLUMN IF EXISTS omie_codigo_pedido,
                             DROP COLUMN IF EXISTS omie_erro,
                             DROP COLUMN IF EXISTS omie_enviado_em,
                             DROP COLUMN IF EXISTS omie_codigo_cliente;

-- Coluna viva: apenas renomeada (dados preservados).
ALTER TABLE public.proposta_itens RENAME COLUMN omie_codigo_produto TO codigo_produto;
ALTER INDEX IF EXISTS idx_proposta_itens_omie_codigo_produto RENAME TO idx_proposta_itens_codigo_produto;

COMMIT;