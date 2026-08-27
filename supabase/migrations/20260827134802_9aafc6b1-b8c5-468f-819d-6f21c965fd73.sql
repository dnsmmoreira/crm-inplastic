CREATE TABLE public.documentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entidade_tipo text NOT NULL CHECK (entidade_tipo IN ('cliente','pedido')),
  entidade_id uuid NOT NULL,
  categoria text NOT NULL CHECK (categoria IN ('contrato_social','balanco','cartao_cnpj','margem_compra','outro')),
  categoria_outro text,
  nome_arquivo text NOT NULL,
  storage_path text NOT NULL,
  tamanho_bytes bigint,
  content_type text,
  enviado_por uuid REFERENCES auth.users,
  enviado_em timestamptz NOT NULL DEFAULT now(),
  expira_em timestamptz,
  removido_em timestamptz,
  removido_por uuid
);

CREATE INDEX documentos_entidade_idx ON public.documentos (entidade_tipo, entidade_id);

GRANT SELECT, INSERT, UPDATE ON public.documentos TO authenticated;
GRANT ALL ON public.documentos TO service_role;

ALTER TABLE public.documentos ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.pode_ver_documento(_tipo text, _entidade_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN public.has_role(auth.uid(), 'admin') THEN true
    WHEN _tipo = 'cliente' THEN (
      public.tem_permissao(auth.uid(), 'clientes.ver_todos')
      OR EXISTS (SELECT 1 FROM public.clientes c WHERE c.id = _entidade_id AND c.vendedor_id = auth.uid())
    )
    WHEN _tipo = 'pedido' THEN (
      public.tem_permissao(auth.uid(), 'pedidos.ver_todos')
      OR EXISTS (SELECT 1 FROM public.pedidos p WHERE p.id = _entidade_id AND p.owner_id = auth.uid())
    )
    ELSE false
  END
$$;

CREATE OR REPLACE FUNCTION public.pode_editar_documento(_tipo text, _entidade_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN public.has_role(auth.uid(), 'admin') THEN true
    WHEN _tipo = 'cliente' THEN
      EXISTS (SELECT 1 FROM public.clientes c WHERE c.id = _entidade_id AND c.vendedor_id = auth.uid())
    WHEN _tipo = 'pedido' THEN (
      public.tem_permissao(auth.uid(), 'pedidos.movimentar')
      OR EXISTS (SELECT 1 FROM public.pedidos p WHERE p.id = _entidade_id AND p.owner_id = auth.uid())
    )
    ELSE false
  END
$$;

CREATE POLICY "documentos select via entidade"
  ON public.documentos FOR SELECT TO authenticated
  USING (public.pode_ver_documento(entidade_tipo, entidade_id));

CREATE POLICY "documentos insert via entidade"
  ON public.documentos FOR INSERT TO authenticated
  WITH CHECK (public.pode_editar_documento(entidade_tipo, entidade_id) AND enviado_por = auth.uid());

CREATE POLICY "documentos update via entidade"
  ON public.documentos FOR UPDATE TO authenticated
  USING (public.pode_editar_documento(entidade_tipo, entidade_id))
  WITH CHECK (public.pode_editar_documento(entidade_tipo, entidade_id));

CREATE POLICY "documentos sem delete fisico"
  ON public.documentos FOR DELETE TO authenticated
  USING (false);