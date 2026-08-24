CREATE TABLE public.cadencia_excecoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escopo text NOT NULL CHECK (escopo IN ('cliente','familia')),
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE CASCADE,
  familia text,
  stage text NOT NULL,
  dias jsonb,
  escalar_diretoria boolean NOT NULL DEFAULT true,
  ativo boolean NOT NULL DEFAULT true,
  observacao text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cadencia_excecoes_escopo_ck CHECK (
    (escopo = 'cliente' AND cliente_id IS NOT NULL AND familia IS NULL)
    OR (escopo = 'familia' AND familia IS NOT NULL AND cliente_id IS NULL)
  )
);

CREATE UNIQUE INDEX cadencia_excecoes_cliente_uk
  ON public.cadencia_excecoes (cliente_id, stage) WHERE escopo = 'cliente';
CREATE UNIQUE INDEX cadencia_excecoes_familia_uk
  ON public.cadencia_excecoes (lower(familia), stage) WHERE escopo = 'familia';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cadencia_excecoes TO authenticated;
GRANT ALL ON public.cadencia_excecoes TO service_role;

ALTER TABLE public.cadencia_excecoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cadencia_excecoes_select" ON public.cadencia_excecoes
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "cadencia_excecoes_write" ON public.cadencia_excecoes
  FOR ALL TO authenticated
  USING (public.tem_permissao(auth.uid(), 'agente_ia.editar_prompt'))
  WITH CHECK (public.tem_permissao(auth.uid(), 'agente_ia.editar_prompt'));

CREATE TRIGGER cadencia_excecoes_updated_at
  BEFORE UPDATE ON public.cadencia_excecoes
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();