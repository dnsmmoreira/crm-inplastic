DROP POLICY IF EXISTS "pedidos owner update" ON public.pedidos;
CREATE POLICY "pedidos owner update" ON public.pedidos
FOR UPDATE
USING (owner_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role) OR tem_permissao(auth.uid(), 'pedidos.movimentar'))
WITH CHECK (owner_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role) OR tem_permissao(auth.uid(), 'pedidos.movimentar'));

DROP POLICY IF EXISTS "ocorrencias via pedido" ON public.pedido_ocorrencias;
CREATE POLICY "ocorrencias via pedido" ON public.pedido_ocorrencias
FOR ALL
USING (EXISTS (SELECT 1 FROM pedidos p WHERE p.id = pedido_ocorrencias.pedido_id AND (p.owner_id = auth.uid() OR has_role(auth.uid(),'admin'::app_role) OR tem_permissao(auth.uid(),'pedidos.movimentar'))))
WITH CHECK (EXISTS (SELECT 1 FROM pedidos p WHERE p.id = pedido_ocorrencias.pedido_id AND (p.owner_id = auth.uid() OR has_role(auth.uid(),'admin'::app_role) OR tem_permissao(auth.uid(),'pedidos.movimentar'))));

DROP POLICY IF EXISTS "stage_history via pedido" ON public.pedido_stage_history;
CREATE POLICY "stage_history via pedido" ON public.pedido_stage_history
FOR ALL
USING (EXISTS (SELECT 1 FROM pedidos p WHERE p.id = pedido_stage_history.pedido_id AND (p.owner_id = auth.uid() OR has_role(auth.uid(),'admin'::app_role) OR tem_permissao(auth.uid(),'pedidos.movimentar'))))
WITH CHECK (EXISTS (SELECT 1 FROM pedidos p WHERE p.id = pedido_stage_history.pedido_id AND (p.owner_id = auth.uid() OR has_role(auth.uid(),'admin'::app_role) OR tem_permissao(auth.uid(),'pedidos.movimentar'))));

DROP POLICY IF EXISTS "fiscal_history via pedido" ON public.pedido_fiscal_history;
CREATE POLICY "fiscal_history via pedido" ON public.pedido_fiscal_history
FOR ALL
USING (EXISTS (SELECT 1 FROM pedidos p WHERE p.id = pedido_fiscal_history.pedido_id AND (p.owner_id = auth.uid() OR has_role(auth.uid(),'admin'::app_role) OR tem_permissao(auth.uid(),'pedidos.movimentar'))))
WITH CHECK (EXISTS (SELECT 1 FROM pedidos p WHERE p.id = pedido_fiscal_history.pedido_id AND (p.owner_id = auth.uid() OR has_role(auth.uid(),'admin'::app_role) OR tem_permissao(auth.uid(),'pedidos.movimentar'))));

DROP POLICY IF EXISTS "notificacoes via pedido" ON public.pedido_notificacoes;
CREATE POLICY "notificacoes via pedido" ON public.pedido_notificacoes
FOR ALL
USING (EXISTS (SELECT 1 FROM pedidos p WHERE p.id = pedido_notificacoes.pedido_id AND (p.owner_id = auth.uid() OR has_role(auth.uid(),'admin'::app_role) OR tem_permissao(auth.uid(),'pedidos.movimentar'))))
WITH CHECK (EXISTS (SELECT 1 FROM pedidos p WHERE p.id = pedido_notificacoes.pedido_id AND (p.owner_id = auth.uid() OR has_role(auth.uid(),'admin'::app_role) OR tem_permissao(auth.uid(),'pedidos.movimentar'))));