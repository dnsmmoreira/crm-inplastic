ALTER TABLE public.chat_mensagens
  ADD COLUMN IF NOT EXISTS respondendo_a uuid NULL REFERENCES public.chat_mensagens(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS chat_mensagens_respondendo_a_idx ON public.chat_mensagens(respondendo_a) WHERE respondendo_a IS NOT NULL;

CREATE OR REPLACE FUNCTION public.tg_chat_mensagem_resposta_mesmo_canal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_canal uuid;
BEGIN
  IF NEW.respondendo_a IS NULL THEN RETURN NEW; END IF;
  IF NEW.respondendo_a = NEW.id THEN
    RAISE EXCEPTION 'Mensagem não pode responder a si mesma' USING ERRCODE = '23514';
  END IF;
  SELECT canal_id INTO v_canal FROM public.chat_mensagens WHERE id = NEW.respondendo_a;
  IF v_canal IS NULL OR v_canal <> NEW.canal_id THEN
    RAISE EXCEPTION 'A mensagem citada precisa ser do mesmo canal' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.tg_chat_mensagem_resposta_mesmo_canal() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS chat_mensagens_resposta_mesmo_canal ON public.chat_mensagens;
CREATE TRIGGER chat_mensagens_resposta_mesmo_canal
  BEFORE INSERT OR UPDATE OF respondendo_a, canal_id ON public.chat_mensagens
  FOR EACH ROW EXECUTE FUNCTION public.tg_chat_mensagem_resposta_mesmo_canal();