CREATE TABLE public.pedido_romaneios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id uuid NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('separacao','conferencia_nf')),
  itens jsonb NOT NULL DEFAULT '[]'::jsonb,
  itens_conferidos jsonb NOT NULL DEFAULT '[]'::jsonb,
  gerado_em timestamptz NOT NULL DEFAULT now(),
  gerado_por uuid,
  concluido_em timestamptz,
  concluido_por uuid,
  UNIQUE (pedido_id, tipo)
);

CREATE INDEX idx_pedido_romaneios_pedido ON public.pedido_romaneios(pedido_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pedido_romaneios TO authenticated;
GRANT ALL ON public.pedido_romaneios TO service_role;

ALTER TABLE public.pedido_romaneios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "romaneios_select" ON public.pedido_romaneios
  FOR SELECT TO authenticated
  USING (public.pode_ver_documento('pedido', pedido_id));

CREATE POLICY "romaneios_insert" ON public.pedido_romaneios
  FOR INSERT TO authenticated
  WITH CHECK (public.pode_editar_documento('pedido', pedido_id));

CREATE POLICY "romaneios_update" ON public.pedido_romaneios
  FOR UPDATE TO authenticated
  USING (public.pode_editar_documento('pedido', pedido_id))
  WITH CHECK (public.pode_editar_documento('pedido', pedido_id));

CREATE POLICY "romaneios_delete" ON public.pedido_romaneios
  FOR DELETE TO authenticated
  USING (public.pode_editar_documento('pedido', pedido_id));