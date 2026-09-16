-- Acompanhamento do Chat Interno: leitura de todas as conversas do time.
-- ATENÇÃO: o gate é DELIBERADAMENTE por id do usuário (Denis), e não por
-- tem_permissao(auth.uid(),'usuarios.gerenciar'), porque hoje essa permissão
-- também pertence ao Wagner e a decisão do Denis (14/09 e 16/09) é que só ele
-- enxerga as DMs privadas de terceiros. Mesmo padrão da migração de 14/09 que
-- restringiu chat_canal_membros do canal 'geral'.
CREATE OR REPLACE FUNCTION public.chat_supervisor_id()
RETURNS uuid
LANGUAGE sql
IMMUTABLE
AS $$ SELECT '376cddcd-ac8f-41bf-83ae-72f4212e3ecd'::uuid $$;

CREATE OR REPLACE FUNCTION public.chat_supervisao_conversas()
RETURNS TABLE(
  canal_id uuid,
  tipo text,
  nome text,
  participantes text[],
  ultima_em timestamptz,
  ultima_previa text,
  total_mensagens bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> public.chat_supervisor_id() THEN
    RAISE EXCEPTION 'Sem permissao para acompanhar as conversas do time';
  END IF;

  RETURN QUERY
  SELECT
    c.id,
    c.tipo::text,
    c.nome,
    COALESCE(
      (SELECT array_agg(p.name ORDER BY p.name)
         FROM public.chat_canal_membros m
         JOIN public.profiles p ON p.id = m.user_id
        WHERE m.canal_id = c.id),
      ARRAY[]::text[]
    ),
    u.criado_em,
    CASE
      WHEN COALESCE(btrim(u.conteudo), '') <> '' THEN btrim(u.conteudo)
      WHEN u.anexo_nome IS NOT NULL THEN '📎 ' || u.anexo_nome
      ELSE NULL
    END,
    COALESCE((SELECT count(*) FROM public.chat_mensagens x WHERE x.canal_id = c.id), 0)
  FROM public.chat_canais c
  LEFT JOIN LATERAL (
    SELECT m.conteudo, m.anexo_nome, m.criado_em
      FROM public.chat_mensagens m
     WHERE m.canal_id = c.id
     ORDER BY m.criado_em DESC
     LIMIT 1
  ) u ON true
  WHERE c.tipo <> 'geral'
  ORDER BY u.criado_em DESC NULLS LAST;
END;
$$;

CREATE OR REPLACE FUNCTION public.chat_supervisao_mensagens(
  _canal_id uuid,
  _antes timestamptz DEFAULT NULL,
  _limite integer DEFAULT 40
)
RETURNS TABLE(
  id uuid,
  canal_id uuid,
  autor_user_id uuid,
  autor_nome text,
  conteudo text,
  criado_em timestamptz,
  anexo_path text,
  anexo_nome text,
  anexo_tipo text,
  anexo_tamanho_bytes bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _tipo text;
  _lim integer := LEAST(GREATEST(COALESCE(_limite, 40), 1), 100);
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> public.chat_supervisor_id() THEN
    RAISE EXCEPTION 'Sem permissao para acompanhar as conversas do time';
  END IF;

  SELECT c.tipo::text INTO _tipo FROM public.chat_canais c WHERE c.id = _canal_id;
  IF _tipo IS NULL OR _tipo = 'geral' THEN
    RAISE EXCEPTION 'Conversa indisponivel para acompanhamento';
  END IF;

  RETURN QUERY
  SELECT
    m.id,
    m.canal_id,
    m.autor_user_id,
    p.name,
    m.conteudo,
    m.criado_em,
    m.anexo_path,
    m.anexo_nome,
    m.anexo_tipo,
    m.anexo_tamanho_bytes::bigint
  FROM public.chat_mensagens m
  LEFT JOIN public.profiles p ON p.id = m.autor_user_id
  WHERE m.canal_id = _canal_id
    AND (_antes IS NULL OR m.criado_em < _antes)
  ORDER BY m.criado_em DESC
  LIMIT _lim;
END;
$$;

REVOKE ALL ON FUNCTION public.chat_supervisao_conversas() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.chat_supervisao_mensagens(uuid, timestamptz, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.chat_supervisao_conversas() TO authenticated;
GRANT EXECUTE ON FUNCTION public.chat_supervisao_mensagens(uuid, timestamptz, integer) TO authenticated;

-- Anexo: membro do canal OU o supervisor (mesmo gate acima), sempre um
-- arquivo por vez, via URL assinada sob demanda.
CREATE OR REPLACE FUNCTION public.pode_acessar_anexo_chat(_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
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
  RETURN public.chat_e_membro(_canal, auth.uid())
      OR auth.uid() = public.chat_supervisor_id();
END;
$$;