
REVOKE EXECUTE ON FUNCTION public.tg_fila_vendedores_equipe_dona() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.equipe_dona_canal_whatsapp() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.equipe_do_usuario(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.whatsapp_conversa_visivel(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.whatsapp_pode_atuar(uuid) FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.placar_ve_tudo(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(
    public.has_role(_user_id, 'admin'::app_role)
    OR public.supervisor_ve_tudo(_user_id)
    OR public.tem_permissao(_user_id, 'pedidos.ver_todos'), false)
$$;
REVOKE EXECUTE ON FUNCTION public.placar_ve_tudo(uuid) FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.placar_vendedores_escopo(_periodo text DEFAULT 'mes')
RETURNS TABLE(vendedor_id uuid, nome text, avatar_color text, ganhos_qtd bigint, ganhos_valor numeric,
  propostas_qtd bigint, conversao numeric, perdas_qtd bigint, leads_contatados bigint,
  tempo_medio_primeira_resposta_min numeric, slas_estourados bigint, carteira_45_60 bigint,
  carteira_60_mais bigint, pos_venda_no_prazo_pct numeric, meta_valor numeric, meta_pct numeric,
  meta_batida boolean, meta_faixa integer, meta_pace_esperado_pct numeric, dias_sem_proposta integer,
  dias_sem_proposta_limite integer, score numeric, score_periodo_anterior numeric, posicao integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH eu AS (
    SELECT auth.uid() AS uid,
           public.placar_ve_tudo(auth.uid()) AS tudo,
           public.equipe_do_usuario(auth.uid()) AS equipe
  ), base AS (
    SELECT p.* FROM public.placar_vendedores(_periodo) p, eu
    WHERE eu.uid IS NOT NULL
      AND (
        eu.tudo
        OR (eu.equipe IS NOT NULL AND public.equipe_do_usuario(p.vendedor_id) = eu.equipe)
        OR (eu.equipe IS NULL AND p.vendedor_id = eu.uid)
      )
  )
  SELECT b.vendedor_id, b.nome, b.avatar_color, b.ganhos_qtd, b.ganhos_valor, b.propostas_qtd,
         b.conversao, b.perdas_qtd, b.leads_contatados, b.tempo_medio_primeira_resposta_min,
         b.slas_estourados, b.carteira_45_60, b.carteira_60_mais, b.pos_venda_no_prazo_pct,
         b.meta_valor, b.meta_pct, b.meta_batida, b.meta_faixa, b.meta_pace_esperado_pct,
         b.dias_sem_proposta, b.dias_sem_proposta_limite, b.score, b.score_periodo_anterior,
         (row_number() OVER (ORDER BY b.posicao ASC))::int AS posicao
  FROM base b
  ORDER BY b.posicao ASC
$$;

CREATE OR REPLACE FUNCTION public.ganhos_fora_do_placar_escopo(_periodo text DEFAULT 'mes')
RETURNS TABLE(vendedor_id uuid, nome text, avatar_color text, ganhos_qtd bigint, ganhos_valor numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH eu AS (
    SELECT auth.uid() AS uid,
           public.placar_ve_tudo(auth.uid()) AS tudo,
           public.equipe_do_usuario(auth.uid()) AS equipe
  )
  SELECT g.vendedor_id, g.nome, g.avatar_color, g.ganhos_qtd, g.ganhos_valor
  FROM public.ganhos_fora_do_placar(_periodo) g, eu
  WHERE eu.uid IS NOT NULL
    AND (
      eu.tudo
      OR (eu.equipe IS NOT NULL AND public.equipe_do_usuario(g.vendedor_id) = eu.equipe)
      OR (eu.equipe IS NULL AND g.vendedor_id = eu.uid)
    )
$$;

REVOKE EXECUTE ON FUNCTION public.placar_vendedores_escopo(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ganhos_fora_do_placar_escopo(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.placar_vendedores_escopo(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ganhos_fora_do_placar_escopo(text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.placar_vendedores(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ganhos_fora_do_placar(text) FROM PUBLIC, anon, authenticated;
