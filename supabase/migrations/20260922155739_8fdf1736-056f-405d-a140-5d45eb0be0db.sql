
CREATE OR REPLACE FUNCTION public.tg_leads_vinculo_cliente()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _doc text := nullif(regexp_replace(coalesce(NEW.cnpj, ''), '\D', '', 'g'), '');
  _doc_cliente text;
  _vend uuid;
  _nome text;
  _origem text := coalesce(current_setting('app.origem', true), '');
BEGIN
  -- 1) sem vínculo: liga ao cliente do mesmo documento (qualquer dono)
  IF NEW.cliente_id IS NULL AND _doc IS NOT NULL AND length(_doc) IN (11, 14) THEN
    SELECT c.id INTO NEW.cliente_id
      FROM public.clientes c
     WHERE regexp_replace(coalesce(c.cnpj, ''), '\D', '', 'g') = _doc
     ORDER BY c.ativo DESC, c.atualizado_em DESC NULLS LAST
     LIMIT 1;
  END IF;

  IF NEW.cliente_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT nullif(regexp_replace(coalesce(c.cnpj, ''), '\D', '', 'g'), ''), c.vendedor_id
    INTO _doc_cliente, _vend
    FROM public.clientes c WHERE c.id = NEW.cliente_id;

  -- 2) vínculo incoerente: só recusa quando OS DOIS documentos existem e diferem
  IF _doc IS NOT NULL AND _doc_cliente IS NOT NULL AND _doc_cliente <> _doc THEN
    RAISE EXCEPTION 'lead % tem CNPJ % e não pode ficar ligado ao cliente % (CNPJ %)',
      NEW.id, _doc, NEW.cliente_id, _doc_cliente
      USING ERRCODE = '23514';
  END IF;

  -- 3) lead e cliente são o mesmo cadastro: o dono tem que ser o mesmo
  IF _vend IS NOT NULL
     AND _vend IS DISTINCT FROM NEW.owner_id
     AND _origem NOT IN ('transferencia_manual','transferencia_carteira') THEN
    SELECT name INTO _nome FROM public.profiles WHERE id = _vend;
    IF (TG_OP = 'INSERT' AND _doc IS NULL)
       OR (TG_OP = 'UPDATE' AND NEW.owner_id IS NOT DISTINCT FROM OLD.owner_id) THEN
      -- atendimento criado para um cliente existente herda o dono do cliente
      NEW.owner_id := _vend;
    ELSE
      RAISE EXCEPTION 'Este CNPJ/CPF já está com %. Fale com essa pessoa antes de seguir.',
        coalesce(_nome, 'outro vendedor') USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.tg_leads_vinculo_cliente() FROM anon, authenticated, public;
