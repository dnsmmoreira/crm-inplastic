
ALTER TABLE public.equipes ADD COLUMN IF NOT EXISTS dona_canal_whatsapp boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS equipes_dona_canal_whatsapp_uni
  ON public.equipes (dona_canal_whatsapp) WHERE dona_canal_whatsapp;
UPDATE public.equipes SET dona_canal_whatsapp = true
  WHERE id = '669b62f1-c1e5-49b1-a9ef-cf139ec1b2ff' AND dona_canal_whatsapp = false;

CREATE OR REPLACE FUNCTION public.equipe_dona_canal_whatsapp()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.equipes WHERE dona_canal_whatsapp LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.equipe_do_usuario(_user_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT equipe_id FROM public.profiles WHERE id = _user_id
$$;

CREATE OR REPLACE FUNCTION public.whatsapp_conversa_visivel(_atribuido uuid, _lead_owner uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN false
    WHEN public.has_role(auth.uid(), 'admin'::app_role) THEN true
    WHEN NOT public.tem_permissao(auth.uid(), 'whatsapp.atender') THEN false
    WHEN coalesce(_atribuido, _lead_owner) IS NULL THEN
      public.equipe_do_usuario(auth.uid()) IS NOT NULL
      AND public.equipe_do_usuario(auth.uid()) = public.equipe_dona_canal_whatsapp()
    ELSE public.mesma_equipe(auth.uid(), coalesce(_atribuido, _lead_owner))
  END
$$;

CREATE OR REPLACE FUNCTION public.whatsapp_pode_atuar(_conversa_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((
    SELECT public.whatsapp_conversa_visivel(
             c.atribuido_para,
             (SELECT l.owner_id FROM public.leads l WHERE l.id = c.lead_id)
           )
    FROM public.whatsapp_conversas c WHERE c.id = _conversa_id
  ), false)
$$;

DROP POLICY IF EXISTS "conversas select atendentes" ON public.whatsapp_conversas;
CREATE POLICY "conversas select atendentes" ON public.whatsapp_conversas
  FOR SELECT TO authenticated
  USING (public.whatsapp_conversa_visivel(
           atribuido_para,
           (SELECT l.owner_id FROM public.leads l WHERE l.id = whatsapp_conversas.lead_id)));

DROP POLICY IF EXISTS "mensagens select atendentes" ON public.whatsapp_mensagens;
CREATE POLICY "mensagens select atendentes" ON public.whatsapp_mensagens
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.whatsapp_conversas c
    WHERE c.id = whatsapp_mensagens.conversa_id
      AND public.whatsapp_conversa_visivel(
            c.atribuido_para,
            (SELECT l.owner_id FROM public.leads l WHERE l.id = c.lead_id))
  ));

CREATE OR REPLACE FUNCTION public.tg_fila_vendedores_equipe_dona()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _eq uuid; _dona uuid;
BEGIN
  SELECT equipe_id INTO _eq FROM public.profiles WHERE id = NEW.user_id;
  _dona := public.equipe_dona_canal_whatsapp();
  IF _dona IS NULL OR _eq IS DISTINCT FROM _dona THEN
    RAISE EXCEPTION 'Somente pessoas da equipe dona do canal de WhatsApp podem entrar na fila de distribuição';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS fila_vendedores_equipe_dona ON public.fila_vendedores;
CREATE TRIGGER fila_vendedores_equipe_dona
  BEFORE INSERT OR UPDATE ON public.fila_vendedores
  FOR EACH ROW EXECUTE FUNCTION public.tg_fila_vendedores_equipe_dona();

CREATE OR REPLACE FUNCTION public.atribuir_proximo_vendedor(_lead_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _next uuid;
  _last uuid;
  _owner uuid;
  _stage lead_stage;
  _found boolean := false;
  _stage_moved boolean := false;
  _dona uuid := public.equipe_dona_canal_whatsapp();
BEGIN
  SELECT true, l.owner_id, l.stage
    INTO _found, _owner, _stage
    FROM public.leads l
    WHERE l.id = _lead_id
    FOR UPDATE;

  IF NOT _found THEN
    RETURN NULL;
  END IF;

  IF _owner IS NOT NULL THEN
    RETURN _owner;
  END IF;

  SELECT ultimo_user_id INTO _last FROM public.fila_estado WHERE id = 1 FOR UPDATE;

  SELECT f.user_id INTO _next
    FROM public.fila_vendedores f
    JOIN public.profiles p ON p.id = f.user_id AND p.equipe_id IS NOT DISTINCT FROM _dona
    WHERE f.ativo = true
      AND (_last IS NULL OR f.posicao > (SELECT posicao FROM public.fila_vendedores WHERE user_id = _last))
    ORDER BY f.posicao ASC
    LIMIT 1;

  IF _next IS NULL THEN
    SELECT f.user_id INTO _next
      FROM public.fila_vendedores f
      JOIN public.profiles p ON p.id = f.user_id AND p.equipe_id IS NOT DISTINCT FROM _dona
      WHERE f.ativo = true
      ORDER BY f.posicao ASC
      LIMIT 1;
  END IF;

  IF _next IS NULL THEN
    RAISE EXCEPTION 'Nenhum vendedor ativo na fila';
  END IF;

  UPDATE public.fila_estado SET ultimo_user_id = _next, updated_at = now() WHERE id = 1;

  IF _stage IN ('novo', 'atendimento') THEN
    _stage_moved := true;
    UPDATE public.leads
      SET owner_id = _next, stage = 'qualificacao', updated_at = now()
      WHERE id = _lead_id;
  ELSE
    UPDATE public.leads
      SET owner_id = _next, updated_at = now()
      WHERE id = _lead_id;
  END IF;

  IF _stage_moved THEN
    UPDATE public.whatsapp_conversas
      SET status = 'qualificado', ia_ativa = false, updated_at = now()
      WHERE lead_id = _lead_id;
  END IF;

  PERFORM set_config('app.origem', 'sync_lead_conversa', true);
  UPDATE public.whatsapp_conversas
     SET atribuido_para = _next,
         atribuido_em = now(),
         ia_ativa = false,
         status = CASE WHEN status IN ('ia_atendendo','aguardando_humano') THEN 'humano_atendendo' ELSE status END,
         updated_at = now()
   WHERE lead_id = _lead_id
     AND status <> 'encerrado'
     AND atribuido_para IS DISTINCT FROM _next;

  RETURN _next;
END; $function$;
