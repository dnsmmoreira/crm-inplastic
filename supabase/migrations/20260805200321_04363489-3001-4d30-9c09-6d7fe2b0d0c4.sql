ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS estoque_atual numeric NOT NULL DEFAULT 0;

UPDATE public.produtos p
SET estoque_atual = COALESCE(s.total, 0)
FROM (SELECT produto_id, SUM(saldo) AS total FROM public.produto_estoque GROUP BY produto_id) s
WHERE s.produto_id = p.id;

DROP TABLE IF EXISTS public.produto_estoque;

CREATE OR REPLACE FUNCTION public.tg_pedido_item_baixa_estoque()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.product_id IS NOT NULL THEN
      UPDATE public.produtos SET estoque_atual = estoque_atual - COALESCE(NEW.quantity, 0)
       WHERE id = NEW.product_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.product_id IS NOT NULL THEN
      UPDATE public.produtos SET estoque_atual = estoque_atual + COALESCE(OLD.quantity, 0)
       WHERE id = OLD.product_id;
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS pedido_itens_baixa_estoque_ins ON public.pedido_itens;
CREATE TRIGGER pedido_itens_baixa_estoque_ins
AFTER INSERT ON public.pedido_itens
FOR EACH ROW EXECUTE FUNCTION public.tg_pedido_item_baixa_estoque();

DROP TRIGGER IF EXISTS pedido_itens_baixa_estoque_del ON public.pedido_itens;
CREATE TRIGGER pedido_itens_baixa_estoque_del
AFTER DELETE ON public.pedido_itens
FOR EACH ROW EXECUTE FUNCTION public.tg_pedido_item_baixa_estoque();