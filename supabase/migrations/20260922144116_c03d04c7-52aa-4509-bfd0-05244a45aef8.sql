
-- 1) Backup da correção de dados (somente o sistema acessa)
CREATE TABLE public.correcao_documento_backup (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tabela text NOT NULL,
  registro_id uuid NOT NULL,
  cnpj_antigo text,
  cliente_id_antigo uuid,
  lote text NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.correcao_documento_backup TO service_role;
ALTER TABLE public.correcao_documento_backup ENABLE ROW LEVEL SECURITY;

-- 2) Normalização do documento no banco: a tela pode mandar com máscara,
--    o banco grava só dígitos. Compatível com o site publicado hoje.
CREATE OR REPLACE FUNCTION public.tg_normaliza_documento()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.cnpj IS NOT NULL THEN
    NEW.cnpj := nullif(regexp_replace(NEW.cnpj, '\D', '', 'g'), '');
  END IF;
  IF TG_TABLE_NAME = 'clientes' THEN
    NEW.cpf := nullif(regexp_replace(coalesce(NEW.cpf, ''), '\D', '', 'g'), '');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_leads_normaliza_documento ON public.leads;
CREATE TRIGGER tg_leads_normaliza_documento
  BEFORE INSERT OR UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.tg_normaliza_documento();

DROP TRIGGER IF EXISTS tg_clientes_normaliza_documento ON public.clientes;
CREATE TRIGGER tg_clientes_normaliza_documento
  BEFORE INSERT OR UPDATE ON public.clientes
  FOR EACH ROW EXECUTE FUNCTION public.tg_normaliza_documento();
