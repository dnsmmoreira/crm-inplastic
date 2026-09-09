CREATE OR REPLACE FUNCTION public.localizar_carteira(_telefone text, _cnpj text, _email text)
 RETURNS TABLE(cliente_id uuid, lead_id uuid, vendedor_id uuid, origem text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _tel text := public.tel_chave(_telefone);
  _doc text := nullif(regexp_replace(coalesce(_cnpj, ''), '\D', '', 'g'), '');
  _mail text := nullif(lower(btrim(coalesce(_email, ''))), '');
BEGIN
  IF _doc IS NOT NULL AND length(_doc) <> 14 THEN _doc := NULL; END IF;
  IF _mail IS NOT NULL AND position('@' in _mail) = 0 THEN _mail := NULL; END IF;
  IF _tel IS NULL AND _doc IS NULL AND _mail IS NULL THEN RETURN; END IF;

  -- (a) clientes ativos
  RETURN QUERY
  SELECT c.id, NULL::uuid, c.vendedor_id,
         (CASE WHEN _doc IS NOT NULL AND regexp_replace(coalesce(c.cnpj,''), '\D', '', 'g') = _doc THEN 'cliente:cnpj'
               WHEN _tel IS NOT NULL AND (public.tel_chave(c.telefone) = _tel OR public.tel_chave(c.telefone2) = _tel) THEN 'cliente:telefone'
               ELSE 'cliente:email' END)::text
    FROM public.clientes c
   WHERE c.ativo IS TRUE
     AND c.vendedor_id IS NOT NULL
     AND (
       (_doc IS NOT NULL AND regexp_replace(coalesce(c.cnpj,''), '\D', '', 'g') = _doc)
       OR (_tel IS NOT NULL AND (public.tel_chave(c.telefone) = _tel OR public.tel_chave(c.telefone2) = _tel))
       OR (_mail IS NOT NULL AND lower(btrim(coalesce(c.email,''))) = _mail)
     )
   ORDER BY c.atualizado_em DESC NULLS LAST
   LIMIT 1;
  IF FOUND THEN RETURN; END IF;

  -- (b) leads ganhos
  RETURN QUERY
  SELECT l.cliente_id, l.id, l.owner_id,
         (CASE WHEN _doc IS NOT NULL AND regexp_replace(coalesce(l.cnpj,''), '\D', '', 'g') = _doc THEN 'lead_ganho:cnpj'
               WHEN _tel IS NOT NULL THEN 'lead_ganho:telefone'
               ELSE 'lead_ganho:email' END)::text
    FROM public.leads l
   WHERE l.stage = 'ganho'::lead_stage
     AND l.owner_id IS NOT NULL
     AND (
       (_doc IS NOT NULL AND regexp_replace(coalesce(l.cnpj,''), '\D', '', 'g') = _doc)
       OR (_tel IS NOT NULL AND _tel IN (
             public.tel_chave(l.whatsapp), public.tel_chave(l.phone),
             public.tel_chave(l.telefone_whatsapp), public.tel_chave(l.telefone_fixo),
             public.tel_chave(l.telefone2)))
       OR (_mail IS NOT NULL AND lower(btrim(coalesce(l.email,''))) = _mail)
     )
   ORDER BY l.updated_at DESC NULLS LAST
   LIMIT 1;
  IF FOUND THEN RETURN; END IF;

  -- (c) leads abertos — só valem quando já houve contato humano registrado.
  RETURN QUERY
  SELECT l.cliente_id, l.id, l.owner_id,
         (CASE WHEN _doc IS NOT NULL AND regexp_replace(coalesce(l.cnpj,''), '\D', '', 'g') = _doc THEN 'lead_aberto:cnpj'
               WHEN _tel IS NOT NULL THEN 'lead_aberto:telefone'
               ELSE 'lead_aberto:email' END)::text
    FROM public.leads l
   WHERE l.stage NOT IN ('ganho'::lead_stage, 'perdido'::lead_stage)
     AND l.owner_id IS NOT NULL
     AND l.last_contact_at IS NOT NULL
     AND (
       (_doc IS NOT NULL AND regexp_replace(coalesce(l.cnpj,''), '\D', '', 'g') = _doc)
       OR (_tel IS NOT NULL AND _tel IN (
             public.tel_chave(l.whatsapp), public.tel_chave(l.phone),
             public.tel_chave(l.telefone_whatsapp), public.tel_chave(l.telefone_fixo),
             public.tel_chave(l.telefone2)))
       OR (_mail IS NOT NULL AND lower(btrim(coalesce(l.email,''))) = _mail)
     )
   ORDER BY l.updated_at DESC NULLS LAST
   LIMIT 1;
END;
$function$;