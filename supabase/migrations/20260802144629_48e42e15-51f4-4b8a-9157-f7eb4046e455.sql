CREATE OR REPLACE FUNCTION public.atribuir_proximo_vendedor(_lead_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _next uuid;
  _last uuid;
  _owner uuid;
  _stage lead_stage;
  _found boolean := false;
  _stage_moved boolean := false;
BEGIN
  -- (1) trava a linha do lead
  SELECT true, l.owner_id, l.stage
    INTO _found, _owner, _stage
    FROM public.leads l
    WHERE l.id = _lead_id
    FOR UPDATE;

  IF NOT _found THEN
    RETURN NULL;
  END IF;

  -- (2) guarda de proprietário: já tem dono, nada é escrito
  IF _owner IS NOT NULL THEN
    RETURN _owner;
  END IF;

  -- (3) só agora trava a fila e escolhe o próximo
  SELECT ultimo_user_id INTO _last FROM public.fila_estado WHERE id = 1 FOR UPDATE;

  SELECT f.user_id INTO _next
    FROM public.fila_vendedores f
    WHERE f.ativo = true
      AND (_last IS NULL OR f.posicao > (SELECT posicao FROM public.fila_vendedores WHERE user_id = _last))
    ORDER BY f.posicao ASC
    LIMIT 1;

  IF _next IS NULL THEN
    SELECT f.user_id INTO _next
      FROM public.fila_vendedores f
      WHERE f.ativo = true
      ORDER BY f.posicao ASC
      LIMIT 1;
  END IF;

  IF _next IS NULL THEN
    RAISE EXCEPTION 'Nenhum vendedor ativo na fila';
  END IF;

  UPDATE public.fila_estado SET ultimo_user_id = _next, updated_at = now() WHERE id = 1;

  -- (4) nunca resetar etapa de lead em andamento
  IF _stage IN ('novo', 'atendimento') THEN
    _stage_moved := true;
    UPDATE public.leads
      SET owner_id = _next,
          stage = 'qualificacao',
          updated_at = now()
      WHERE id = _lead_id;
  ELSE
    UPDATE public.leads
      SET owner_id = _next,
          updated_at = now()
      WHERE id = _lead_id;
  END IF;

  -- (5) só desliga a IA quando a etapa foi movida
  IF _stage_moved THEN
    UPDATE public.whatsapp_conversas
      SET status = 'qualificado',
          ia_ativa = false,
          updated_at = now()
      WHERE lead_id = _lead_id;
  END IF;

  RETURN _next;
END; $function$;

REVOKE ALL ON FUNCTION public.atribuir_proximo_vendedor(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.atribuir_proximo_vendedor(uuid) TO service_role;