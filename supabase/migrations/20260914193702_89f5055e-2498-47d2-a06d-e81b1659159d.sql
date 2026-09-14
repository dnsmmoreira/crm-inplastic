-- 1) DELETE só para admin (número nunca reaproveitado, histórico preservado)
DROP POLICY IF EXISTS "fichas_coleta via pedido" ON public.fichas_coleta;

CREATE POLICY "fichas_coleta leitura" ON public.fichas_coleta
  FOR SELECT TO authenticated
  USING (public.pode_acessar_ficha_pedido(pedido_id));

CREATE POLICY "fichas_coleta insert" ON public.fichas_coleta
  FOR INSERT TO authenticated
  WITH CHECK (public.pode_acessar_ficha_pedido(pedido_id));

CREATE POLICY "fichas_coleta update" ON public.fichas_coleta
  FOR UPDATE TO authenticated
  USING (public.pode_acessar_ficha_pedido(pedido_id))
  WITH CHECK (public.pode_acessar_ficha_pedido(pedido_id));

CREATE POLICY "fichas_coleta delete admin" ON public.fichas_coleta
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "ficha_coleta_itens via ficha" ON public.ficha_coleta_itens;

CREATE POLICY "ficha_coleta_itens leitura" ON public.ficha_coleta_itens
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.fichas_coleta f
                 WHERE f.id = ficha_coleta_itens.ficha_id
                   AND public.pode_acessar_ficha_pedido(f.pedido_id)));

CREATE POLICY "ficha_coleta_itens insert" ON public.ficha_coleta_itens
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.fichas_coleta f
                 WHERE f.id = ficha_coleta_itens.ficha_id
                   AND public.pode_acessar_ficha_pedido(f.pedido_id)));

CREATE POLICY "ficha_coleta_itens update" ON public.ficha_coleta_itens
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.fichas_coleta f
                 WHERE f.id = ficha_coleta_itens.ficha_id
                   AND public.pode_acessar_ficha_pedido(f.pedido_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.fichas_coleta f
                 WHERE f.id = ficha_coleta_itens.ficha_id
                   AND public.pode_acessar_ficha_pedido(f.pedido_id)));

CREATE POLICY "ficha_coleta_itens delete admin" ON public.ficha_coleta_itens
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- histórico: só admin apaga (authenticated não tem GRANT DELETE, dupla trava)
REVOKE DELETE ON public.ficha_coleta_historico FROM authenticated;

CREATE POLICY "ficha_coleta_historico delete admin" ON public.ficha_coleta_historico
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- 2) Imutabilidade pós-emissão no banco (não depende da camada de aplicação)
CREATE OR REPLACE FUNCTION public.tg_ficha_coleta_imutavel()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'rascunho' THEN
    RETURN NEW;
  END IF;

  IF NEW.numero IS DISTINCT FROM OLD.numero
     OR NEW.pedido_id IS DISTINCT FROM OLD.pedido_id
     OR NEW.emitter_id IS DISTINCT FROM OLD.emitter_id
     OR NEW.transportadora_id IS DISTINCT FROM OLD.transportadora_id
     OR NEW.transportadora_nome IS DISTINCT FROM OLD.transportadora_nome
     OR NEW.modalidade_entrega IS DISTINCT FROM OLD.modalidade_entrega
     OR NEW.contato_nome IS DISTINCT FROM OLD.contato_nome
     OR NEW.contato_telefone IS DISTINCT FROM OLD.contato_telefone
     OR NEW.previsao_coleta_data IS DISTINCT FROM OLD.previsao_coleta_data
     OR NEW.previsao_coleta_hora IS DISTINCT FROM OLD.previsao_coleta_hora
     OR NEW.motorista IS DISTINCT FROM OLD.motorista
     OR NEW.placa IS DISTINCT FROM OLD.placa
     OR NEW.volumes IS DISTINCT FROM OLD.volumes
     OR NEW.observacoes IS DISTINCT FROM OLD.observacoes
     OR NEW.peso_total_kg IS DISTINCT FROM OLD.peso_total_kg
     OR NEW.cubagem_m3 IS DISTINCT FROM OLD.cubagem_m3
     OR NEW.snapshot IS DISTINCT FROM OLD.snapshot
     OR NEW.emitida_em IS DISTINCT FROM OLD.emitida_em
     OR NEW.emitida_por IS DISTINCT FROM OLD.emitida_por
  THEN
    RAISE EXCEPTION 'Ficha % já emitida: os dados estão congelados.', OLD.numero;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ficha_coleta_imutavel ON public.fichas_coleta;
CREATE TRIGGER trg_ficha_coleta_imutavel
  BEFORE UPDATE ON public.fichas_coleta
  FOR EACH ROW EXECUTE FUNCTION public.tg_ficha_coleta_imutavel();

CREATE OR REPLACE FUNCTION public.tg_ficha_coleta_itens_congelados()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _ficha uuid := COALESCE(NEW.ficha_id, OLD.ficha_id);
  _status text;
BEGIN
  SELECT status INTO _status FROM public.fichas_coleta WHERE id = _ficha;
  IF _status IS NOT NULL AND _status <> 'rascunho' THEN
    RAISE EXCEPTION 'Ficha já emitida: os itens estão congelados.';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_ficha_coleta_itens_congelados ON public.ficha_coleta_itens;
CREATE TRIGGER trg_ficha_coleta_itens_congelados
  BEFORE INSERT OR UPDATE OR DELETE ON public.ficha_coleta_itens
  FOR EACH ROW EXECUTE FUNCTION public.tg_ficha_coleta_itens_congelados();