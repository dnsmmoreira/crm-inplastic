-- Tela de falhas: registro central de erros que hoje só iam para console.error.
-- ROLLBACK:
--   DROP TABLE IF EXISTS public.falhas_sistema;
--   DELETE FROM public.perfil_permissoes WHERE permissao_chave = 'sistema.ver_falhas';
--   DELETE FROM public.permissoes WHERE chave = 'sistema.ver_falhas';

CREATE TABLE IF NOT EXISTS public.falhas_sistema (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  origem text NOT NULL,
  mensagem text NOT NULL,
  contexto jsonb,
  ocorrido_em timestamptz NOT NULL DEFAULT now(),
  resolvido_em timestamptz,
  resolvido_por uuid,
  ocorrencias int NOT NULL DEFAULT 1
);

GRANT SELECT, UPDATE ON public.falhas_sistema TO authenticated;
GRANT ALL ON public.falhas_sistema TO service_role;

ALTER TABLE public.falhas_sistema ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS falhas_sistema_abertas_idx
  ON public.falhas_sistema (resolvido_em, ocorrido_em DESC);
CREATE INDEX IF NOT EXISTS falhas_sistema_origem_idx
  ON public.falhas_sistema (origem);

-- Agrupamento: uma linha por (origem, mensagem) enquanto não resolvida.
CREATE UNIQUE INDEX IF NOT EXISTS falhas_sistema_agrupamento_idx
  ON public.falhas_sistema (origem, mensagem)
  WHERE resolvido_em IS NULL;

CREATE POLICY "falhas_select_permissao"
  ON public.falhas_sistema FOR SELECT TO authenticated
  USING (public.tem_permissao(auth.uid(), 'sistema.ver_falhas'));

CREATE POLICY "falhas_update_permissao"
  ON public.falhas_sistema FOR UPDATE TO authenticated
  USING (public.tem_permissao(auth.uid(), 'sistema.ver_falhas'))
  WITH CHECK (public.tem_permissao(auth.uid(), 'sistema.ver_falhas'));

INSERT INTO public.permissoes (chave, grupo, rotulo, descricao, tipo)
VALUES ('sistema.ver_falhas', 'sistema', 'Ver falhas do sistema',
        'Acessa a tela de falhas, filas travadas e avisos sem aceite', 'booleana')
ON CONFLICT (chave) DO UPDATE
  SET grupo = EXCLUDED.grupo, rotulo = EXCLUDED.rotulo,
      descricao = EXCLUDED.descricao, tipo = EXCLUDED.tipo;

INSERT INTO public.perfil_permissoes (perfil_id, permissao_chave)
SELECT p.id, 'sistema.ver_falhas' FROM public.perfis p
WHERE p.nome = 'Administrador'
ON CONFLICT DO NOTHING;