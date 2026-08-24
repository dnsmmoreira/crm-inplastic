CREATE TABLE public.contatos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  papel text NOT NULL,
  cargo text,
  telefone text,
  telefone2 text,
  email text,
  observacao text,
  lead_id uuid REFERENCES public.leads(id),
  cliente_id uuid REFERENCES public.clientes(id),
  ativo boolean NOT NULL DEFAULT true,
  criado_por uuid,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contatos_vinculo_chk CHECK (lead_id IS NOT NULL OR cliente_id IS NOT NULL)
);

GRANT SELECT, INSERT, UPDATE ON public.contatos TO authenticated;
GRANT ALL ON public.contatos TO service_role;

ALTER TABLE public.contatos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contatos select via vinculo" ON public.contatos FOR SELECT TO authenticated USING (
  has_role(auth.uid(),'admin'::app_role)
  OR EXISTS (SELECT 1 FROM public.leads l WHERE l.id = contatos.lead_id AND l.owner_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.clientes c WHERE c.id = contatos.cliente_id AND (c.vendedor_id = auth.uid() OR tem_permissao(auth.uid(),'clientes.ver_todos')))
);
CREATE POLICY "contatos insert via vinculo" ON public.contatos FOR INSERT TO authenticated WITH CHECK (
  has_role(auth.uid(),'admin'::app_role)
  OR EXISTS (SELECT 1 FROM public.leads l WHERE l.id = contatos.lead_id AND l.owner_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.clientes c WHERE c.id = contatos.cliente_id AND c.vendedor_id = auth.uid())
);
CREATE POLICY "contatos update via vinculo" ON public.contatos FOR UPDATE TO authenticated USING (
  has_role(auth.uid(),'admin'::app_role)
  OR EXISTS (SELECT 1 FROM public.leads l WHERE l.id = contatos.lead_id AND l.owner_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.clientes c WHERE c.id = contatos.cliente_id AND c.vendedor_id = auth.uid())
) WITH CHECK (
  has_role(auth.uid(),'admin'::app_role)
  OR EXISTS (SELECT 1 FROM public.leads l WHERE l.id = contatos.lead_id AND l.owner_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.clientes c WHERE c.id = contatos.cliente_id AND c.vendedor_id = auth.uid())
);
CREATE POLICY "contatos no delete" ON public.contatos FOR DELETE USING (false);

CREATE INDEX contatos_lead_id_idx ON public.contatos(lead_id);
CREATE INDEX contatos_cliente_id_idx ON public.contatos(cliente_id);

CREATE OR REPLACE FUNCTION public.tg_contatos_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER contatos_touch BEFORE UPDATE ON public.contatos
FOR EACH ROW EXECUTE FUNCTION public.tg_contatos_touch();