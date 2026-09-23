-- 1) Chave no catálogo
INSERT INTO public.permissoes (chave, grupo, rotulo, descricao, tipo)
VALUES ('chat.supervisionar', 'chat', 'Supervisionar o chat interno',
        'Ler as conversas diretas de toda a equipe e abrir conversa com qualquer pessoa.',
        'booleana')
ON CONFLICT (chave) DO NOTHING;

-- 2) Perfil "Diretoria"
INSERT INTO public.perfis (nome, descricao, base_role, papel, ativo, protegido)
VALUES ('Diretoria', 'Administrador com supervisão do chat interno.',
        'admin'::app_role, 'Administrador', true, false)
ON CONFLICT (nome) DO NOTHING;

INSERT INTO public.perfil_permissoes (perfil_id, permissao_chave, valor_numerico)
SELECT (SELECT id FROM public.perfis WHERE nome = 'Diretoria'),
       pp.permissao_chave, pp.valor_numerico
  FROM public.perfil_permissoes pp
  JOIN public.perfis p ON p.id = pp.perfil_id
 WHERE p.nome = 'Administrador'
ON CONFLICT DO NOTHING;

INSERT INTO public.perfil_permissoes (perfil_id, permissao_chave)
VALUES ((SELECT id FROM public.perfis WHERE nome = 'Diretoria'), 'chat.supervisionar')
ON CONFLICT DO NOTHING;

-- 3) Move o supervisor atual
DELETE FROM public.user_perfis WHERE user_id = '376cddcd-ac8f-41bf-83ae-72f4212e3ecd';
INSERT INTO public.user_perfis (user_id, perfil_id)
VALUES ('376cddcd-ac8f-41bf-83ae-72f4212e3ecd',
        (SELECT id FROM public.perfis WHERE nome = 'Diretoria'));

-- 4) Funções passam a perguntar pela permissão
CREATE OR REPLACE FUNCTION public.chat_pode_conversar(_a uuid, _b uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.tem_permissao(_a, 'chat.supervisionar')
      OR public.tem_permissao(_b, 'chat.supervisionar')
      OR public.mesma_equipe(_a, _b)
      OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = _a AND p.gestor_id = _b)
      OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = _b AND p.gestor_id = _a)
$function$;

CREATE OR REPLACE FUNCTION public.pode_acessar_anexo_chat(_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
      OR public.tem_permissao(auth.uid(), 'chat.supervisionar');
END;
$function$;

CREATE OR REPLACE FUNCTION public.chat_supervisao_conversas()
 RETURNS TABLE(canal_id uuid, tipo text, nome text, participantes text[], ultima_em timestamp with time zone, ultima_previa text, total_mensagens bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.tem_permissao(auth.uid(), 'chat.supervisionar') THEN
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
$function$;

CREATE OR REPLACE FUNCTION public.chat_supervisao_mensagens(_canal_id uuid, _antes timestamp with time zone DEFAULT NULL::timestamp with time zone, _limite integer DEFAULT 40)
 RETURNS TABLE(id uuid, canal_id uuid, autor_user_id uuid, autor_nome text, conteudo text, criado_em timestamp with time zone, anexo_path text, anexo_nome text, anexo_tipo text, anexo_tamanho_bytes bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _tipo text;
  _lim integer := LEAST(GREATEST(COALESCE(_limite, 40), 1), 100);
BEGIN
  IF auth.uid() IS NULL OR NOT public.tem_permissao(auth.uid(), 'chat.supervisionar') THEN
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
$function$;

-- 5) O UUID no código deixa de existir.
DROP FUNCTION IF EXISTS public.chat_supervisor_id();