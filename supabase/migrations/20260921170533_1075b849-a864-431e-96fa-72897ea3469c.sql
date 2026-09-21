REVOKE EXECUTE ON FUNCTION public.whatsapp_conversa_visivel_auditor(uuid, uuid) FROM anon;

CREATE TABLE public.xerife_avaliacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  xerife_log_id uuid NOT NULL REFERENCES public.xerife_log(id) ON DELETE CASCADE,
  avaliador_id uuid NOT NULL DEFAULT auth.uid(),
  veredito text NOT NULL CHECK (veredito IN ('justa', 'indevida')),
  nota text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (xerife_log_id, avaliador_id)
);

CREATE TABLE public.xerife_deixou_passar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendedor_id uuid NOT NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  descricao text NOT NULL,
  avaliador_id uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_xerife_avaliacoes_log ON public.xerife_avaliacoes(xerife_log_id);
CREATE INDEX idx_xerife_deixou_passar_vendedor ON public.xerife_deixou_passar(vendedor_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.xerife_avaliacoes TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.xerife_deixou_passar TO authenticated;
GRANT ALL ON public.xerife_avaliacoes TO service_role;
GRANT ALL ON public.xerife_deixou_passar TO service_role;

ALTER TABLE public.xerife_avaliacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.xerife_deixou_passar ENABLE ROW LEVEL SECURITY;

-- Leitura: o próprio avaliador e os administradores.
CREATE POLICY "avaliacoes select proprio ou admin"
  ON public.xerife_avaliacoes FOR SELECT TO authenticated
  USING (avaliador_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "deixou_passar select proprio ou admin"
  ON public.xerife_deixou_passar FOR SELECT TO authenticated
  USING (avaliador_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Escrita: só com `xerife.avaliar`, sempre em nome próprio e sobre a equipe.
CREATE POLICY "avaliacoes insert avaliador equipe"
  ON public.xerife_avaliacoes FOR INSERT TO authenticated
  WITH CHECK (
    avaliador_id = auth.uid()
    AND public.tem_permissao(auth.uid(), 'xerife.avaliar')
    AND EXISTS (
      SELECT 1 FROM public.xerife_log xl
      WHERE xl.id = xerife_avaliacoes.xerife_log_id
        AND (public.supervisor_ve_tudo(auth.uid()) OR public.mesma_equipe(auth.uid(), xl.vendedor_id))
    )
  );

CREATE POLICY "avaliacoes update avaliador equipe"
  ON public.xerife_avaliacoes FOR UPDATE TO authenticated
  USING (avaliador_id = auth.uid() AND public.tem_permissao(auth.uid(), 'xerife.avaliar'))
  WITH CHECK (
    avaliador_id = auth.uid()
    AND public.tem_permissao(auth.uid(), 'xerife.avaliar')
    AND EXISTS (
      SELECT 1 FROM public.xerife_log xl
      WHERE xl.id = xerife_avaliacoes.xerife_log_id
        AND (public.supervisor_ve_tudo(auth.uid()) OR public.mesma_equipe(auth.uid(), xl.vendedor_id))
    )
  );

CREATE POLICY "deixou_passar insert avaliador equipe"
  ON public.xerife_deixou_passar FOR INSERT TO authenticated
  WITH CHECK (
    avaliador_id = auth.uid()
    AND public.tem_permissao(auth.uid(), 'xerife.avaliar')
    AND (public.supervisor_ve_tudo(auth.uid()) OR public.mesma_equipe(auth.uid(), vendedor_id))
  );

CREATE POLICY "deixou_passar update avaliador equipe"
  ON public.xerife_deixou_passar FOR UPDATE TO authenticated
  USING (avaliador_id = auth.uid() AND public.tem_permissao(auth.uid(), 'xerife.avaliar'))
  WITH CHECK (
    avaliador_id = auth.uid()
    AND public.tem_permissao(auth.uid(), 'xerife.avaliar')
    AND (public.supervisor_ve_tudo(auth.uid()) OR public.mesma_equipe(auth.uid(), vendedor_id))
  );

CREATE TRIGGER tg_xerife_avaliacoes_updated_at
  BEFORE UPDATE ON public.xerife_avaliacoes
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TRIGGER tg_xerife_deixou_passar_updated_at
  BEFORE UPDATE ON public.xerife_deixou_passar
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();