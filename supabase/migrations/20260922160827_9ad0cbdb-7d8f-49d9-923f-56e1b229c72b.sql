-- 1) Vínculo lead x cliente: recusa só na CRIAÇÃO ou na LIGAÇÃO indevida.
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

    IF _dono_mudou THEN
      -- TRANSFERÊNCIA de um lead que já existe: nunca recusar.
      -- O gatilho AFTER leva o cliente (e, por ele, o resto) para o novo dono.
      NULL;
    ELSIF (TG_OP = 'INSERT' AND _doc IS NULL)
       OR (TG_OP = 'UPDATE' AND NOT _ligacao_mudou) THEN
      -- atendimento criado para um cliente existente (ou edição comum) herda o dono
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

-- 2) Troca de dono do lead leva o cliente ligado junto (e o gatilho do cliente
--    leva os demais leads, tarefas, conversas e propostas abertas).
CREATE OR REPLACE FUNCTION public.tg_leads_dono_propaga()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _origem text := coalesce(current_setting('app.origem', true), '');
BEGIN
  IF NEW.owner_id IS NULL
     OR NEW.cliente_id IS NULL
     OR NEW.owner_id IS NOT DISTINCT FROM OLD.owner_id THEN
    RETURN NULL;
  END IF;

  -- guarda contra recursão: a volta vem do gatilho do cliente
  IF _origem = 'transferencia_carteira' THEN
    RETURN NULL;
  END IF;

  UPDATE public.clientes
     SET vendedor_id = NEW.owner_id
   WHERE id = NEW.cliente_id
     AND vendedor_id IS DISTINCT FROM NEW.owner_id;

  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS tg_leads_dono_propaga ON public.leads;
CREATE TRIGGER tg_leads_dono_propaga
AFTER UPDATE OF owner_id ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.tg_leads_dono_propaga();

REVOKE EXECUTE ON FUNCTION public.tg_leads_dono_propaga() FROM anon, authenticated, public;

-- 3) Conversa atribuída: nunca mais falhar em silêncio.
CREATE OR REPLACE FUNCTION public.tg_conversa_dono_para_lead()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  BEGIN
    IF NEW.atribuido_para IS NOT NULL AND NEW.lead_id IS NOT NULL
       AND NEW.atribuido_para IS DISTINCT FROM OLD.atribuido_para THEN
      PERFORM set_config('app.origem', 'sync_conversa_lead', true);
      UPDATE public.leads
         SET owner_id = NEW.atribuido_para, updated_at = now()
       WHERE id = NEW.lead_id
         AND owner_id IS DISTINCT FROM NEW.atribuido_para;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    PERFORM public.log_falha_trigger(
      'tg_conversa_dono_para_lead',
      SQLERRM,
      jsonb_build_object('conversa_id', NEW.id, 'lead_id', NEW.lead_id,
                         'atribuido_para', NEW.atribuido_para, 'sqlstate', SQLSTATE));
  END;
  RETURN NULL;
END;
$function$;