ALTER TYPE public.pedido_stage ADD VALUE IF NOT EXISTS 'analise_financeira';
ALTER TYPE public.pedido_stage ADD VALUE IF NOT EXISTS 'programacao';
ALTER TYPE public.pedido_stage ADD VALUE IF NOT EXISTS 'pronto';
ALTER TYPE public.pedido_stage ADD VALUE IF NOT EXISTS 'faturado_em_rota';
ALTER TYPE public.pedido_stage ADD VALUE IF NOT EXISTS 'pos_venda';
ALTER TYPE public.pedido_stage ADD VALUE IF NOT EXISTS 'reprovado_financeiro';