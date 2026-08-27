CREATE OR REPLACE FUNCTION public.ganhos_por_vendedor(_start timestamptz, _end timestamptz)
RETURNS TABLE(vid uuid, qtd bigint, valor numeric)
LANGUAGE sql
STABLE SECURITY INVOKER
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

REVOKE ALL ON FUNCTION public.ganhos_por_vendedor(timestamptz, timestamptz) FROM public, anon, authenticated;