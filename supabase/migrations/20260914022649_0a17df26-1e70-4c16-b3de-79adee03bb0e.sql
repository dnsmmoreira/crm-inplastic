-- ============ Chat Interno ============
CREATE TABLE public.chat_canais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL CHECK (tipo IN ('geral','direto')),
  nome text,
  par_chave text UNIQUE,
  criado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chat_canais_par_chave_coerente CHECK (
    (tipo = 'direto' AND par_chave IS NOT NULL) OR (tipo <> 'direto' AND par_chave IS NULL)
  )
);

CREATE TABLE public.chat_canal_membros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canal_id uuid NOT NULL REFERENCES public.chat_canais(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  last_read_at timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (canal_id, user_id)
);
CREATE INDEX chat_canal_membros_user_idx ON public.chat_canal_membros (user_id);

CREATE TABLE public.chat_mensagens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canal_id uuid NOT NULL REFERENCES public.chat_canais(id) ON DELETE CASCADE,
  autor_user_id uuid NOT NULL,
  conteudo text NOT NULL CHECK (char_length(conteudo) BETWEEN 1 AND 4000),
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX chat_mensagens_canal_criado_idx ON public.chat_mensagens (canal_id, criado_em);

GRANT SELECT ON public.chat_canais TO authenticated;
GRANT ALL ON public.chat_canais TO service_role;
GRANT SELECT, UPDATE ON public.chat_canal_membros TO authenticated;
GRANT ALL ON public.chat_canal_membros TO service_role;
GRANT SELECT, INSERT ON public.chat_mensagens TO authenticated;
GRANT ALL ON public.chat_mensagens TO service_role;

-- Evita recursão de RLS entre membros e mensagens/canais.
CREATE OR REPLACE FUNCTION public.chat_e_membro(_canal_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_canal_membros m
    WHERE m.canal_id = _canal_id AND m.user_id = _user_id
  )
$$;
REVOKE ALL ON FUNCTION public.chat_e_membro(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.chat_e_membro(uuid, uuid) TO authenticated;

ALTER TABLE public.chat_canais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_canal_membros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_mensagens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chat canais: membro le"
  ON public.chat_canais FOR SELECT TO authenticated
  USING (public.chat_e_membro(id, auth.uid()));

CREATE POLICY "chat membros: propria linha le"
  ON public.chat_canal_membros FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "chat membros: propria linha atualiza"
  ON public.chat_canal_membros FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "chat mensagens: membro le"
  ON public.chat_mensagens FOR SELECT TO authenticated
  USING (public.chat_e_membro(canal_id, auth.uid()));

CREATE POLICY "chat mensagens: membro escreve"
  ON public.chat_mensagens FOR INSERT TO authenticated
  WITH CHECK (autor_user_id = auth.uid() AND public.chat_e_membro(canal_id, auth.uid()));

-- ============ Canal Geral ============
INSERT INTO public.chat_canais (tipo, nome) VALUES ('geral', 'Geral');

INSERT INTO public.chat_canal_membros (canal_id, user_id)
SELECT c.id, p.id
FROM public.chat_canais c
CROSS JOIN public.profiles p
WHERE c.tipo = 'geral' AND p.ativo IS TRUE AND p.deleted_at IS NULL
ON CONFLICT (canal_id, user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.tg_profiles_entra_no_chat_geral()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_canal uuid;
BEGIN
  IF NEW.ativo IS NOT TRUE OR NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  SELECT id INTO v_canal FROM public.chat_canais WHERE tipo = 'geral' LIMIT 1;
  IF v_canal IS NULL THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.chat_canal_membros (canal_id, user_id)
  VALUES (v_canal, NEW.id)
  ON CONFLICT (canal_id, user_id) DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Nunca derruba a criação/atualização do perfil.
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_profiles_chat_geral
AFTER INSERT OR UPDATE OF ativo, deleted_at ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.tg_profiles_entra_no_chat_geral();

-- ============ Conversa direta (idempotente) ============
CREATE OR REPLACE FUNCTION public.chat_obter_ou_criar_canal_direto(_outro_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_eu uuid := auth.uid();
  v_chave text;
  v_canal uuid;
BEGIN
  IF v_eu IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;
  IF _outro_user_id IS NULL OR _outro_user_id = v_eu THEN
    RAISE EXCEPTION 'Destinatário inválido';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = _outro_user_id AND p.ativo IS TRUE AND p.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Usuário indisponível';
  END IF;

  v_chave := least(v_eu::text, _outro_user_id::text) || ':' || greatest(v_eu::text, _outro_user_id::text);

  SELECT id INTO v_canal FROM public.chat_canais WHERE par_chave = v_chave;
  IF v_canal IS NOT NULL THEN
    RETURN v_canal;
  END IF;

  BEGIN
    INSERT INTO public.chat_canais (tipo, par_chave) VALUES ('direto', v_chave)
    RETURNING id INTO v_canal;
  EXCEPTION WHEN unique_violation THEN
    SELECT id INTO v_canal FROM public.chat_canais WHERE par_chave = v_chave;
    RETURN v_canal;
  END;

  INSERT INTO public.chat_canal_membros (canal_id, user_id)
  VALUES (v_canal, v_eu), (v_canal, _outro_user_id)
  ON CONFLICT (canal_id, user_id) DO NOTHING;

  RETURN v_canal;
END;
$$;
REVOKE ALL ON FUNCTION public.chat_obter_ou_criar_canal_direto(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.chat_obter_ou_criar_canal_direto(uuid) TO authenticated;

-- ============ Notificação de DM (nunca derruba o insert) ============
CREATE OR REPLACE FUNCTION public.tg_chat_mensagem_notifica_dm()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tipo text;
  v_autor text;
BEGIN
  SELECT tipo INTO v_tipo FROM public.chat_canais WHERE id = NEW.canal_id;
  IF v_tipo IS DISTINCT FROM 'direto' THEN
    RETURN NULL;
  END IF;
  SELECT COALESCE(name, 'Colega') INTO v_autor FROM public.profiles WHERE id = NEW.autor_user_id;

  INSERT INTO public.notificacoes (user_id, tipo, titulo)
  SELECT m.user_id, 'chat_interno_dm', 'Nova mensagem de ' || COALESCE(v_autor, 'um colega')
  FROM public.chat_canal_membros m
  WHERE m.canal_id = NEW.canal_id AND m.user_id <> NEW.autor_user_id;

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  -- Aviso é acessório: a mensagem sempre permanece salva.
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_chat_mensagem_notifica_dm
AFTER INSERT ON public.chat_mensagens
FOR EACH ROW EXECUTE FUNCTION public.tg_chat_mensagem_notifica_dm();

-- ============ Realtime ============
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_mensagens;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_canal_membros;