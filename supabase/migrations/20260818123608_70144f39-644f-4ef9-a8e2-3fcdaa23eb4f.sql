CREATE POLICY "propostas select ver_todas" ON public.propostas FOR SELECT TO authenticated USING (public.tem_permissao(auth.uid(), 'propostas.ver_todas'));
CREATE POLICY "proposta_itens select ver_todas" ON public.proposta_itens FOR SELECT TO authenticated USING (public.tem_permissao(auth.uid(), 'propostas.ver_todas'));
CREATE POLICY "proposta_parcelas select ver_todas" ON public.proposta_parcelas FOR SELECT TO authenticated USING (public.tem_permissao(auth.uid(), 'propostas.ver_todas'));
CREATE POLICY "pedidos select ver_todos" ON public.pedidos FOR SELECT TO authenticated USING (public.tem_permissao(auth.uid(), 'pedidos.ver_todos'));
CREATE POLICY "pedido_itens select ver_todos" ON public.pedido_itens FOR SELECT TO authenticated USING (public.tem_permissao(auth.uid(), 'pedidos.ver_todos'));
CREATE POLICY "clientes select ver_todos" ON public.clientes FOR SELECT TO authenticated USING (public.tem_permissao(auth.uid(), 'clientes.ver_todos'));