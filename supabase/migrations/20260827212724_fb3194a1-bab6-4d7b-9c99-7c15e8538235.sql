-- Placar / ARENA: valor ganho passa a vir dos PEDIDOS, nunca de leads.estimated_value.
CREATE OR REPLACE FUNCTION public.ganhos_por_vendedor(_start timestamptz, _end timestamptz)
RETURNS TABLE(vid uuid, qtd bigint, valor numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT coalesce(p.vendedor_proprietario_id, p.owner_id) AS vid,
         count(*)::bigint AS qtd,
         coalesce(sum(p.total), 0)::numeric AS valor
  FROM public.pedidos p
  WHERE p.created_at >= _start
    AND p.created_at <  _end
    AND p.stage NOT IN ('reprovado_financeiro'::pedido_stage, 'cancelado'::pedido_stage)
  GROUP BY 1
$fn$;

REVOKE ALL ON FUNCTION public.ganhos_por_vendedor(timestamptz, timestamptz) FROM public;
GRANT EXECUTE ON FUNCTION public.ganhos_por_vendedor(timestamptz, timestamptz) TO authenticated, service_role;

-- Reescreve placar_vendedores trocando apenas as CTEs de origem de ganhos e de participantes.
DO $do$
DECLARE
  def text;
  novo text;
  old_v text := '  WITH vendedores AS (
    -- A3: participação na ARENA passa a ser o critério oficial do placar
    SELECT ur.user_id AS vid
    FROM public.user_roles ur
    JOIN public.arena_participacao ap
      ON ap.user_id = ur.user_id AND ap.participa_arena = true
    WHERE ur.role = ''vendedor''::app_role
    GROUP BY ur.user_id
  ),';
  new_v text := '  WITH vendedores AS (
    SELECT ap.user_id AS vid
    FROM public.arena_participacao ap
    WHERE ap.participa_arena = true
    GROUP BY ap.user_id
  ),';
  old_g text := '  ganhos AS (
    SELECT l.owner_id AS vid, count(*)::bigint AS qtd, coalesce(sum(l.estimated_value),0) AS valor
    FROM public.leads l WHERE l.stage = ''ganho'' AND l.etapa_changed_at >= _p_start AND l.etapa_changed_at < _p_end
    GROUP BY l.owner_id
  ),';
  new_g text := '  ganhos AS (
    SELECT g.vid, g.qtd, g.valor FROM public.ganhos_por_vendedor(_p_start, _p_end) g
  ),';
  old_gp text := '  ganhos_prev AS (
    SELECT l.owner_id AS vid, count(*)::bigint AS qtd, coalesce(sum(l.estimated_value),0) AS valor FROM public.leads l
    WHERE l.stage=''ganho'' AND l.etapa_changed_at >= _prev_start AND l.etapa_changed_at < _prev_end GROUP BY l.owner_id
  ),';
  new_gp text := '  ganhos_prev AS (
    SELECT g.vid, g.qtd, g.valor FROM public.ganhos_por_vendedor(_prev_start, _prev_end) g
  ),';
BEGIN
  def := pg_get_functiondef('public.placar_vendedores(text)'::regprocedure);
  IF position(old_v IN def) = 0 THEN RAISE EXCEPTION 'CTE vendedores não encontrada'; END IF;
  IF position(old_g IN def) = 0 THEN RAISE EXCEPTION 'CTE ganhos não encontrada'; END IF;
  IF position(old_gp IN def) = 0 THEN RAISE EXCEPTION 'CTE ganhos_prev não encontrada'; END IF;
  novo := replace(replace(replace(def, old_v, new_v), old_g, new_g), old_gp, new_gp);
  EXECUTE novo;
END
$do$;

-- Histórico mensal usa a mesma fonte e o mesmo critério de participação.
CREATE OR REPLACE FUNCTION public.snapshot_metas_mes(_ano int, _mes int)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  _p_start timestamptz;
  _p_end timestamptz;
  _n int := 0;
BEGIN
  _p_start := make_timestamptz(_ano, _mes, 1, 0, 0, 0, 'America/Sao_Paulo');
  _p_end := _p_start + interval '1 month';

  INSERT INTO public.vendedor_metas_historico
    (user_id, ano, mes, meta_valor, ganhos_valor, ganhos_qtd, atingido_pct, bateu, snapshot_at)
  SELECT
    ap.user_id,
    _ano, _mes,
    coalesce(vm.meta_valor_mensal, 0),
    coalesce(g.valor, 0),
    coalesce(g.qtd, 0)::int,
    CASE WHEN coalesce(vm.meta_valor_mensal,0) > 0
         THEN round((coalesce(g.valor,0)/vm.meta_valor_mensal)*100, 2) ELSE 0 END,
    (coalesce(vm.meta_valor_mensal,0) > 0 AND coalesce(g.valor,0) >= vm.meta_valor_mensal),
    now()
  FROM public.arena_participacao ap
  LEFT JOIN public.vendedor_metas vm ON vm.user_id = ap.user_id
  LEFT JOIN public.ganhos_por_vendedor(_p_start, _p_end) g ON g.vid = ap.user_id
  WHERE ap.participa_arena = true
  ON CONFLICT (user_id, ano, mes) DO UPDATE
    SET meta_valor = EXCLUDED.meta_valor,
        ganhos_valor = EXCLUDED.ganhos_valor,
        ganhos_qtd = EXCLUDED.ganhos_qtd,
        atingido_pct = EXCLUDED.atingido_pct,
        bateu = EXCLUDED.bateu,
        snapshot_at = now();

  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END;
$fn$;

-- Recálculo retroativo do histórico já fechado.
SELECT public.snapshot_metas_mes(h.ano, h.mes)
FROM (SELECT DISTINCT ano, mes FROM public.vendedor_metas_historico) h;