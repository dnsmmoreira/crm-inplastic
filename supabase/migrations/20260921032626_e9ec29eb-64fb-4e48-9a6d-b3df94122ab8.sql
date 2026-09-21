
ALTER TABLE public.chat_canais ADD COLUMN IF NOT EXISTS equipe_id uuid REFERENCES public.equipes(id);
UPDATE public.chat_canais SET equipe_id = '669b62f1-c1e5-49b1-a9ef-cf139ec1b2ff'
  WHERE id = 'a1b2c3d4-0000-4000-8000-000000000001';

INSERT INTO public.chat_canais (id, tipo, nome, equipe_id)
VALUES ('a1b2c3d4-0000-4000-8000-000000000002', 'grupo', 'Grupo Maxicaixa', 'e2891ee3-6d0f-45c3-ac96-b2b5c86681e7')
ON CONFLICT (id) DO UPDATE SET nome = excluded.nome, equipe_id = excluded.equipe_id;

INSERT INTO public.chat_canal_membros (canal_id, user_id)
SELECT 'a1b2c3d4-0000-4000-8000-000000000002', p.id
FROM public.profiles p
WHERE p.equipe_id = 'e2891ee3-6d0f-45c3-ac96-b2b5c86681e7'
  AND p.ativo IS TRUE AND p.deleted_at IS NULL
ON CONFLICT DO NOTHING;

DELETE FROM public.chat_canal_membros m
USING public.profiles p
WHERE m.user_id = p.id
  AND m.canal_id = 'a1b2c3d4-0000-4000-8000-000000000001'
  AND p.equipe_id IS DISTINCT FROM '669b62f1-c1e5-49b1-a9ef-cf139ec1b2ff';

CREATE OR REPLACE FUNCTION public.tg_profiles_entra_no_grupo_comercial()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _canal uuid;
BEGIN
  BEGIN
    IF NEW.ativo IS TRUE AND NEW.deleted_at IS NULL AND NEW.equipe_id IS NOT NULL THEN
      SELECT c.id INTO _canal FROM public.chat_canais c
        WHERE c.tipo = 'grupo' AND c.equipe_id = NEW.equipe_id LIMIT 1;
      IF _canal IS NOT NULL THEN
        INSERT INTO public.chat_canal_membros (canal_id, user_id)
        VALUES (_canal, NEW.id) ON CONFLICT DO NOTHING;
      END IF;
      DELETE FROM public.chat_canal_membros m
        USING public.chat_canais c
        WHERE m.user_id = NEW.id AND m.canal_id = c.id
          AND c.tipo = 'grupo' AND c.equipe_id IS DISTINCT FROM NEW.equipe_id;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.chat_pode_conversar(_a uuid, _b uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _a = public.chat_supervisor_id()
      OR _b = public.chat_supervisor_id()
      OR public.mesma_equipe(_a, _b)
      OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = _a AND p.gestor_id = _b)
      OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = _b AND p.gestor_id = _a)
$$;
REVOKE EXECUTE ON FUNCTION public.chat_pode_conversar(uuid, uuid) FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.chat_listar_colegas()
RETURNS TABLE(id uuid, name text, avatar_color text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.name, p.avatar_color
  FROM public.profiles p
  WHERE p.ativo = true
    AND p.deleted_at IS NULL
    AND p.id <> auth.uid()
    AND public.chat_pode_conversar(auth.uid(), p.id)
  ORDER BY p.name
$$;

CREATE OR REPLACE FUNCTION public.chat_obter_ou_criar_canal_direto(_outro_user_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  IF NOT public.chat_pode_conversar(v_eu, _outro_user_id) THEN
    RAISE EXCEPTION 'Você só pode conversar com pessoas da sua equipe, com seu gestor ou com quem você lidera';
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
$function$;
