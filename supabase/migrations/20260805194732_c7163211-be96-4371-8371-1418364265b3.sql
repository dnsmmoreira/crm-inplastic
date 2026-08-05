CREATE TABLE IF NOT EXISTS public.produto_estoque (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id uuid NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  deposito text NOT NULL DEFAULT 'Principal',
  saldo numeric NOT NULL DEFAULT 0,
  saldo_minimo numeric NOT NULL DEFAULT 10,
  origem text NOT NULL DEFAULT 'manual',
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (produto_id, deposito)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.produto_estoque TO authenticated;
GRANT ALL ON public.produto_estoque TO service_role;

ALTER TABLE public.produto_estoque ENABLE ROW LEVEL SECURITY;

CREATE POLICY "estoque select autenticado" ON public.produto_estoque
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "estoque insert admin" ON public.produto_estoque
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "estoque update admin" ON public.produto_estoque
  FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "estoque delete admin" ON public.produto_estoque
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.tg_produto_estoque_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.atualizado_em = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS produto_estoque_touch ON public.produto_estoque;
CREATE TRIGGER produto_estoque_touch BEFORE UPDATE ON public.produto_estoque
  FOR EACH ROW EXECUTE FUNCTION public.tg_produto_estoque_touch();