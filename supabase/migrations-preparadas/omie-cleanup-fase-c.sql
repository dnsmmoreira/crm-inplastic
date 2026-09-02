-- ============================================================================
-- FASE C — DROP do legado Omie no BANCO.  *** NÃO APLICADO ***
-- Este arquivo NÃO está em supabase/migrations/ de propósito: é um rascunho
-- para o Denis decidir (com backup ou não) antes de rodar.
--
-- Contexto: o Omie foi descontinuado como direção e nunca houve chamada real
-- à API. O código já não lê nem escreve nada abaixo (fases (a) e (b) feitas).
--
-- Contagem de linhas NÃO-NULAS no momento em que este arquivo foi gerado
-- (2026-09-02) — use para decidir se vale exportar antes de dropar:
--
--   produtos_omie ............................... 225 linhas  (catálogo espelho, órfão)
--   produtos.codigo_produto_omie ................   0 não-nulos
--   clientes.omie_codigo_cliente_inplastic ......   0 não-nulos
--   clientes.omie_codigo_cliente_taoplast .......   0 não-nulos
--   emitters.omie_key ...........................   3 não-nulos  (chaves de API — legado, inúteis)
--   propostas.omie_status .......................   1 não-nulo
--   propostas.omie_numero_pedido ................   0 não-nulos
--   propostas.omie_codigo_pedido ................   0 não-nulos
--   propostas.omie_erro .........................   1 não-nulo
--   propostas.omie_enviado_em ...................   0 não-nulos
--   propostas.omie_codigo_cliente ...............  (não conferido; coluna existe)
--   leads.omie_status ...........................   1 não-nulo
--   leads.omie_numero_pedido ....................   0 não-nulos
--   leads.omie_codigo_pedido / omie_erro / omie_enviado_em / omie_codigo_cliente
--                                                (não conferidos; colunas existem)
--
-- OBS 1: a tabela `pedidos` NÃO possui colunas `omie_*` — nada a dropar lá.
-- OBS 2: `proposta_itens.omie_codigo_produto` está VIVO (é o código do produto
--        usado na seleção de itens) e por isso NÃO entra neste script.
--
-- Sugestão de backup antes de rodar:
--   CREATE TABLE backup_produtos_omie AS SELECT * FROM public.produtos_omie;
-- ============================================================================

BEGIN;

-- catálogo espelho do Omie (225 linhas, sem leitor no app)
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

COMMIT;
