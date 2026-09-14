DO $$
DECLARE _geral uuid;
BEGIN
  SELECT id INTO _geral FROM public.chat_canais WHERE tipo = 'geral' LIMIT 1;
  IF _geral IS NULL THEN RETURN; END IF;

  DELETE FROM public.chat_canal_membros
  WHERE canal_id = _geral
    AND user_id <> '376cddcd-ac8f-41bf-83ae-72f4212e3ecd'::uuid;

  INSERT INTO public.chat_canal_membros (canal_id, user_id)
  VALUES (_geral, '376cddcd-ac8f-41bf-83ae-72f4212e3ecd'::uuid)
  ON CONFLICT DO NOTHING;
END $$;

DROP TRIGGER IF EXISTS trg_profiles_chat_geral ON public.profiles;
DROP FUNCTION IF EXISTS public.tg_profiles_entra_no_chat_geral();