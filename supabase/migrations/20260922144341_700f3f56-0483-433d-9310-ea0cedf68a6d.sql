
-- Coerência lead x cliente + vínculo automático por documento
CREATE OR REPLACE FUNCTION public.tg_leads_vinculo_cliente()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _doc text := nullif(regexp_replace(coalesce(NEW.cnpj, ''), '\D', '', 'g'), '');
  _doc_cliente text;
BEGIN
  -- 1) sem vínculo: liga ao cliente do mesmo documento, só se o dono for o mesmo
  IF NEW.cliente_id IS NULL AND _doc IS NOT NULL AND length(_doc) = 14 THEN
    SELECT c.id INTO NEW.cliente_id
      FROM public.clientes c
     WHERE regexp_replace(coalesce(c.cnpj, ''), '\D', '', 'g') = _doc
       AND c.vendedor_id IS NOT DISTINCT FROM NEW.owner_id
     ORDER BY c.ativo DESC, c.atualizado_em DESC NULLS LAST
     LIMIT 1;
  END IF;

  -- 2) vínculo incoerente: só recusa quando OS DOIS documentos existem e diferem
  IF NEW.cliente_id IS NOT NULL AND _doc IS NOT NULL THEN
    SELECT nullif(regexp_replace(coalesce(c.cnpj, ''), '\D', '', 'g'), '')
      INTO _doc_cliente
      FROM public.clientes c WHERE c.id = NEW.cliente_id;
    IF _doc_cliente IS NOT NULL AND _doc_cliente <> _doc THEN
      RAISE EXCEPTION 'lead % tem CNPJ % e não pode ficar ligado ao cliente % (CNPJ %)',
        NEW.id, _doc, NEW.cliente_id, _doc_cliente
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_leads_vinculo_cliente ON public.leads;
CREATE TRIGGER tg_leads_vinculo_cliente
  BEFORE INSERT OR UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.tg_leads_vinculo_cliente();

-- Auditoria de toda troca de cliente no lead
CREATE OR REPLACE FUNCTION public.tg_leads_cliente_auditoria()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    IF NEW.cliente_id IS DISTINCT FROM OLD.cliente_id THEN
      INSERT INTO public.user_audit_log (alvo_user_id, ator_user_id, campo, valor_anterior, valor_novo)
      VALUES (NEW.owner_id, auth.uid(), 'leads.cliente_id:' || NEW.id::text,
              coalesce(OLD.cliente_id::text, ''), coalesce(NEW.cliente_id::text, ''));
    END IF;
  EXCEPTION WHEN OTHERS THEN
    PERFORM public.log_falha_trigger('tg_leads_cliente_auditoria', SQLERRM,
      jsonb_build_object('sqlstate', SQLSTATE, 'lead_id', NEW.id));
  END;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS tg_leads_cliente_auditoria ON public.leads;
CREATE TRIGGER tg_leads_cliente_auditoria
  AFTER UPDATE OF cliente_id ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.tg_leads_cliente_auditoria();

-- Documento único pelo valor normalizado
DROP INDEX IF EXISTS public.leads_cnpj_uniq;
CREATE UNIQUE INDEX leads_cnpj_digits_uniq
  ON public.leads ((regexp_replace(coalesce(cnpj, ''), '\D', '', 'g')))
  WHERE cnpj IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS clientes_cnpj_digits_uniq
  ON public.clientes ((regexp_replace(coalesce(cnpj, ''), '\D', '', 'g')))
  WHERE cnpj IS NOT NULL;
