-- =====================================================================
-- LOTE 1B — separar LEITURA de ESCRITA na ficha de coleta
-- =====================================================================

-- Nova função só para escrita: igual à de leitura, porém SEM 'pedidos.ver_todos'.
CREATE OR REPLACE FUNCTION public.pode_editar_ficha_pedido(_pedido_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.pedidos p
    WHERE p.id = _pedido_id
      AND (
        p.owner_id = auth.uid()
        OR p.vendedor_proprietario_id = auth.uid()
        OR has_role(auth.uid(), 'admin'::app_role)
        OR tem_permissao(auth.uid(), 'pedidos.movimentar')
        OR tem_permissao(auth.uid(), 'pedidos.operar_producao')
      )
  )
$function$;

REVOKE EXECUTE ON FUNCTION public.pode_editar_ficha_pedido(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pode_editar_ficha_pedido(uuid) TO authenticated, service_role;

-- fichas_coleta: leitura continua como está; escrita passa a usar a função nova.
DROP POLICY IF EXISTS "fichas_coleta insert" ON public.fichas_coleta;
CREATE POLICY "fichas_coleta insert"
  ON public.fichas_coleta FOR INSERT TO authenticated
  WITH CHECK (public.pode_editar_ficha_pedido(pedido_id));

DROP POLICY IF EXISTS "fichas_coleta update" ON public.fichas_coleta;
CREATE POLICY "fichas_coleta update"
  ON public.fichas_coleta FOR UPDATE TO authenticated
  USING (public.pode_editar_ficha_pedido(pedido_id))
  WITH CHECK (public.pode_editar_ficha_pedido(pedido_id));

-- ficha_coleta_itens: idem.
DROP POLICY IF EXISTS "ficha_coleta_itens insert" ON public.ficha_coleta_itens;
CREATE POLICY "ficha_coleta_itens insert"
  ON public.ficha_coleta_itens FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.fichas_coleta f
    WHERE f.id = ficha_coleta_itens.ficha_id
      AND public.pode_editar_ficha_pedido(f.pedido_id)));

DROP POLICY IF EXISTS "ficha_coleta_itens update" ON public.ficha_coleta_itens;
CREATE POLICY "ficha_coleta_itens update"
  ON public.ficha_coleta_itens FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.fichas_coleta f
    WHERE f.id = ficha_coleta_itens.ficha_id
      AND public.pode_editar_ficha_pedido(f.pedido_id)))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.fichas_coleta f
    WHERE f.id = ficha_coleta_itens.ficha_id
      AND public.pode_editar_ficha_pedido(f.pedido_id)));

-- ficha_coleta_historico: escrita segue a mesma regra.
DROP POLICY IF EXISTS "ficha_coleta_historico insert" ON public.ficha_coleta_historico;
CREATE POLICY "ficha_coleta_historico insert"
  ON public.ficha_coleta_historico FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.fichas_coleta f
    WHERE f.id = ficha_coleta_historico.ficha_id
      AND public.pode_editar_ficha_pedido(f.pedido_id)));