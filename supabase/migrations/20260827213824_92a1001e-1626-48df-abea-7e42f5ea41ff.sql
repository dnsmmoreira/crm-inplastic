CREATE OR REPLACE FUNCTION public.ganhos_fora_do_placar(_periodo text DEFAULT 'mes'::text)
RETURNS TABLE(vendedor_id uuid, nome text, avatar_color text, ganhos_qtd bigint, ganhos_valor numeric)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _sp timestamp := (now() AT TIME ZONE 'America/Sao_Paulo');
  _p_start timestamptz; _p_end timestamptz;
BEGIN
  IF _periodo = 'semana' THEN
    _p_start := (date_trunc('week', _sp)) AT TIME ZONE 'America/Sao_Paulo';
    _p_end := _p_start + interval '7 days';
  ELSIF _periodo = 'trimestre' THEN
    _p_start := (date_trunc('quarter', _sp)) AT TIME ZONE 'America/Sao_Paulo';
    _p_end := _p_start + interval '3 months';
  ELSE
    _p_start := (date_trunc('month', _sp)) AT TIME ZONE 'America/Sao_Paulo';
    _p_end := _p_start + interval '1 month';
  END IF;

  RETURN QUERY
  WITH participantes AS (
    SELECT ur.user_id AS vid
    FROM public.user_roles ur
    JOIN public.arena_participacao ap
      ON ap.user_id = ur.user_id AND ap.participa_arena = true
    WHERE ur.role = 'vendedor'::app_role
    GROUP BY ur.user_id
  ),
  g AS (
    SELECT * FROM public.ganhos_por_vendedor(_p_start, _p_end)
  )
  SELECT
    g.vid,
    coalesce(p.name, 'Sem responsável')::text,
    coalesce(p.avatar_color, '#64748b')::text,
    g.qtd,
    g.valor
  FROM g
  LEFT JOIN public.profiles p ON p.id = g.vid
  WHERE g.vid IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM participantes pa WHERE pa.vid = g.vid)
    AND g.valor > 0
  ORDER BY g.valor DESC;
END;
$function$;

REVOKE ALL ON FUNCTION public.ganhos_fora_do_placar(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ganhos_fora_do_placar(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ganhos_fora_do_placar(text) TO service_role;