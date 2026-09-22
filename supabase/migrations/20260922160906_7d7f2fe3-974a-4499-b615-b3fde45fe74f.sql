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
  _dono_mudou boolean := (TG_OP = 'UPDATE' AND NEW.owner_id IS DISTINCT FROM OLD.owner_id);
  _ligacao_mudou boolean := (TG_OP = 'UPDATE' AND (
        NEW.cliente_id IS DISTINCT FROM OLD.cliente_id
     OR coalesce(NEW.cnpj, '') IS DISTINCT FROM coalesce(OLD.cnpj, '')));
BEGIN
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

  IF _doc IS NOT NULL AND _doc_cliente IS NOT NULL AND _doc_cliente <> _doc THEN
    RAISE EXCEPTION 'lead % tem CNPJ % e não pode ficar ligado ao cliente % (CNPJ %)',
      NEW.id, _doc, NEW.cliente_id, _doc_cliente
      USING ERRCODE = '23514';
  END IF;

  IF _vend IS NOT NULL
     AND _vend IS DISTINCT FROM NEW.owner_id
     AND _origem NOT IN ('transferencia_manual','transferencia_carteira') THEN

    IF _dono_mudou THEN
      -- transferência de lead existente: nunca recusar (o AFTER leva o cliente)
      NULL;
    ELSIF NEW.owner_id IS NULL
       OR (TG_OP = 'INSERT' AND _doc IS NULL)
       OR (TG_OP = 'UPDATE' AND NOT _ligacao_mudou) THEN
      -- entrada sem dono, atendimento criado para cliente existente ou edição comum
      NEW.owner_id := _vend;
    ELSE
      SELECT name INTO _nome FROM public.profiles WHERE id = _vend;
      RAISE EXCEPTION 'Este CNPJ/CPF já está com %. Fale com essa pessoa antes de seguir.',
        coalesce(_nome, 'outro vendedor') USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;