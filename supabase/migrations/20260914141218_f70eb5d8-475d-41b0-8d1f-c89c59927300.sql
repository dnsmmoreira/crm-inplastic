-- 1) Novo tipo de canal 'grupo'
ALTER TABLE public.chat_canais DROP CONSTRAINT IF EXISTS chat_canais_tipo_check;
ALTER TABLE public.chat_canais
  ADD CONSTRAINT chat_canais_tipo_check CHECK (tipo IN ('geral','direto','grupo'));

CREATE UNIQUE INDEX IF NOT EXISTS chat_canais_grupo_nome_uk
  ON public.chat_canais (nome) WHERE tipo = 'grupo';

INSERT INTO public.chat_canais (id, tipo, nome)
VALUES ('a1b2c3d4-0000-4000-8000-000000000001', 'grupo', 'Grupo Comercial')
ON CONFLICT (id) DO NOTHING;

-- Backfill: todo perfil ativo é membro do Grupo Comercial
INSERT INTO public.chat_canal_membros (canal_id, user_id)
SELECT 'a1b2c3d4-0000-4000-8000-000000000001', p.id
FROM public.profiles p
WHERE p.ativo IS TRUE AND p.deleted_at IS NULL
ON CONFLICT DO NOTHING;

-- Entrada automática de novos perfis ativos (nunca derruba a gravação do perfil)
CREATE OR REPLACE FUNCTION public.tg_profiles_entra_no_grupo_comercial()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    IF NEW.ativo IS TRUE AND NEW.deleted_at IS NULL THEN
      INSERT INTO public.chat_canal_membros (canal_id, user_id)
      VALUES ('a1b2c3d4-0000-4000-8000-000000000001', NEW.id)
      ON CONFLICT DO NOTHING;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.tg_profiles_entra_no_grupo_comercial() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_profiles_grupo_comercial ON public.profiles;
CREATE TRIGGER trg_profiles_grupo_comercial
AFTER INSERT OR UPDATE OF ativo, deleted_at ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.tg_profiles_entra_no_grupo_comercial();

-- 2) Campos de anexo nas mensagens
ALTER TABLE public.chat_mensagens
  ADD COLUMN IF NOT EXISTS anexo_path text,
  ADD COLUMN IF NOT EXISTS anexo_nome text,
  ADD COLUMN IF NOT EXISTS anexo_tipo text,
  ADD COLUMN IF NOT EXISTS anexo_tamanho_bytes bigint;

ALTER TABLE public.chat_mensagens DROP CONSTRAINT IF EXISTS chat_mensagens_conteudo_check;
ALTER TABLE public.chat_mensagens
  ADD CONSTRAINT chat_mensagens_conteudo_check
  CHECK (char_length(conteudo) <= 4000
         AND (char_length(btrim(conteudo)) > 0 OR anexo_path IS NOT NULL));

CREATE INDEX IF NOT EXISTS chat_mensagens_anexo_idx
  ON public.chat_mensagens (criado_em) WHERE anexo_path IS NOT NULL;

-- 3) Acesso ao bucket chat-anexos: só membros do canal do path
CREATE OR REPLACE FUNCTION public.pode_acessar_anexo_chat(_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _canal uuid;
BEGIN
  BEGIN
    _canal := split_part(_name, '/', 1)::uuid;
  EXCEPTION WHEN OTHERS THEN
    RETURN false;
  END;
  IF _canal IS NULL OR auth.uid() IS NULL THEN
    RETURN false;
  END IF;
  RETURN public.chat_e_membro(_canal, auth.uid());
END;
$$;

REVOKE ALL ON FUNCTION public.pode_acessar_anexo_chat(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pode_acessar_anexo_chat(text) TO authenticated;

DROP POLICY IF EXISTS "chat anexos select membro" ON storage.objects;
CREATE POLICY "chat anexos select membro" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'chat-anexos' AND public.pode_acessar_anexo_chat(name));

DROP POLICY IF EXISTS "chat anexos insert membro" ON storage.objects;
CREATE POLICY "chat anexos insert membro" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'chat-anexos' AND public.pode_acessar_anexo_chat(name));

DROP POLICY IF EXISTS "chat anexos update membro" ON storage.objects;
CREATE POLICY "chat anexos update membro" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'chat-anexos' AND public.pode_acessar_anexo_chat(name))
  WITH CHECK (bucket_id = 'chat-anexos' AND public.pode_acessar_anexo_chat(name));

DROP POLICY IF EXISTS "chat anexos delete membro" ON storage.objects;
CREATE POLICY "chat anexos delete membro" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'chat-anexos' AND public.pode_acessar_anexo_chat(name));
