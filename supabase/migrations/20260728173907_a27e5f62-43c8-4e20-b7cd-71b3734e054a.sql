-- pedido_stage_history
DROP POLICY IF EXISTS hist_select_authenticated ON public.pedido_stage_history;
DROP POLICY IF EXISTS hist_insert_authenticated ON public.pedido_stage_history;
CREATE POLICY "stage_history via pedido" ON public.pedido_stage_history
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.pedidos p WHERE p.id = pedido_stage_history.pedido_id AND (p.owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.pedidos p WHERE p.id = pedido_stage_history.pedido_id AND (p.owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))));

-- pedido_ocorrencias
DROP POLICY IF EXISTS ocorrencias_select_auth ON public.pedido_ocorrencias;
DROP POLICY IF EXISTS ocorrencias_insert_auth ON public.pedido_ocorrencias;
DROP POLICY IF EXISTS ocorrencias_update_auth ON public.pedido_ocorrencias;
CREATE POLICY "ocorrencias via pedido" ON public.pedido_ocorrencias
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.pedidos p WHERE p.id = pedido_ocorrencias.pedido_id AND (p.owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.pedidos p WHERE p.id = pedido_ocorrencias.pedido_id AND (p.owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))));

-- pedido_fiscal_history
DROP POLICY IF EXISTS fiscal_history_select_auth ON public.pedido_fiscal_history;
DROP POLICY IF EXISTS fiscal_history_insert_auth ON public.pedido_fiscal_history;
CREATE POLICY "fiscal_history via pedido" ON public.pedido_fiscal_history
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.pedidos p WHERE p.id = pedido_fiscal_history.pedido_id AND (p.owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.pedidos p WHERE p.id = pedido_fiscal_history.pedido_id AND (p.owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))));

-- pedido_notificacoes
DROP POLICY IF EXISTS pedido_notificacoes_select_auth ON public.pedido_notificacoes;
DROP POLICY IF EXISTS pedido_notificacoes_insert_auth ON public.pedido_notificacoes;
DROP POLICY IF EXISTS pedido_notificacoes_update_auth ON public.pedido_notificacoes;
CREATE POLICY "notificacoes via pedido" ON public.pedido_notificacoes
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.pedidos p WHERE p.id = pedido_notificacoes.pedido_id AND (p.owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.pedidos p WHERE p.id = pedido_notificacoes.pedido_id AND (p.owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))));

ALTER TABLE public.pedido_stage_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedido_ocorrencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedido_fiscal_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedido_notificacoes ENABLE ROW LEVEL SECURITY;