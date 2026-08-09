CREATE TABLE public.mensagem_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NOT NULL,
  categoria text NOT NULL,
  corpo text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  ordem int NOT NULL DEFAULT 0,
  criado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mensagem_templates TO authenticated;
GRANT ALL ON public.mensagem_templates TO service_role;

ALTER TABLE public.mensagem_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados veem modelos ativos"
  ON public.mensagem_templates FOR SELECT TO authenticated
  USING (ativo = true OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin cria modelos"
  ON public.mensagem_templates FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin edita modelos"
  ON public.mensagem_templates FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin remove modelos"
  ON public.mensagem_templates FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER mensagem_templates_updated_at
  BEFORE UPDATE ON public.mensagem_templates
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

INSERT INTO public.mensagem_templates (titulo, categoria, corpo, ordem) VALUES
('Primeiro contato', 'abertura', 'Olá {{nome}}, tudo bem? Aqui é da equipe comercial. Vi que a {{empresa}} demonstrou interesse em pallets plásticos. Posso te ajudar a encontrar o modelo certo para a sua operação?', 1),
('Retomada de contato', 'abertura', 'Oi {{nome}}, passando para retomar nossa conversa sobre os pallets plásticos da {{empresa}}. Consegue me dizer se a necessidade continua de pé?', 2),
('Levantamento técnico', 'qualificacao', '{{nome}}, para te indicar o pallet ideal preciso de 3 informações: 1) peso médio da carga por pallet; 2) se é para armazenagem, porta-pallet ou exportação; 3) quantidade estimada. Assim envio a solução mais econômica para a {{empresa}}.', 3),
('Uso e logística', 'qualificacao', '{{nome}}, os pallets vão rodar em caminhão, empilhadeira ou câmara fria? Essa informação muda bastante a recomendação de modelo e a durabilidade na {{empresa}}.', 4),
('Envio de proposta', 'proposta', '{{nome}}, acabei de preparar a proposta para a {{empresa}} com o modelo que melhor atende sua operação, já com valores, prazo de entrega e condições de pagamento. Pode conferir e me dizer o que achou?', 5),
('Follow-up da proposta', 'follow-up', 'Oi {{nome}}, conseguiu analisar a proposta que enviei para a {{empresa}}? Se algum ponto ficou fora do esperado, me diga qual que eu reviso com você.', 6),
('Fechamento', 'fechamento', '{{nome}}, consigo garantir a produção dentro do prazo combinado se fecharmos hoje. Quer que eu já reserve a quantidade para a {{empresa}}?', 7),
('Pós-venda', 'pos-venda', '{{nome}}, os pallets chegaram certinhos na {{empresa}}? Qualquer ajuste na operação ou nova necessidade, é só me chamar por aqui.', 8);