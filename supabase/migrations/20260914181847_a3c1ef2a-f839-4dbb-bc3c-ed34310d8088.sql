-- Empresa/unidade: contato padrão de coleta e endereço de expedição
ALTER TABLE public.emitters
  ADD COLUMN IF NOT EXISTS contato_coleta_nome text,
  ADD COLUMN IF NOT EXISTS contato_coleta_telefone text,
  ADD COLUMN IF NOT EXISTS endereco_coleta text;

UPDATE public.emitters
   SET contato_coleta_nome = COALESCE(NULLIF(btrim(contato_coleta_nome), ''), 'Bruna'),
       contato_coleta_telefone = COALESCE(NULLIF(btrim(contato_coleta_telefone), ''), '(11) 2574-1360');

-- Transportadoras: dados fiscais, endereço e abrangência por UF
ALTER TABLE public.transportadoras
  ADD COLUMN IF NOT EXISTS cnpj text,
  ADD COLUMN IF NOT EXISTS razao_social text,
  ADD COLUMN IF NOT EXISTS ie text,
  ADD COLUMN IF NOT EXISTS cep text,
  ADD COLUMN IF NOT EXISTS logradouro text,
  ADD COLUMN IF NOT EXISTS numero text,
  ADD COLUMN IF NOT EXISTS complemento text,
  ADD COLUMN IF NOT EXISTS bairro text,
  ADD COLUMN IF NOT EXISTS cidade text,
  ADD COLUMN IF NOT EXISTS uf text,
  ADD COLUMN IF NOT EXISTS telefone text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS abrangencia_ufs text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS transportadoras_cnpj_key
  ON public.transportadoras (cnpj)
  WHERE cnpj IS NOT NULL AND btrim(cnpj) <> '';

DROP TRIGGER IF EXISTS trg_transportadoras_updated_at ON public.transportadoras;
CREATE TRIGGER trg_transportadoras_updated_at
  BEFORE UPDATE ON public.transportadoras
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
