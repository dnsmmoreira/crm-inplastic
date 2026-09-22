-- =====================================================================
-- LOTE 1 DE SEGURANÇA — identidade e acesso anônimo
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Fecha a auto-edição do próprio perfil.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "profiles_self_update_campos_pessoais" ON public.profiles;

-- ---------------------------------------------------------------------
-- 2) Defesa em profundidade: o gatilho passa a trabalhar por ALLOWLIST.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_profiles_admin_fields_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- service role (auth.uid() nulo) e administradores passam direto
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  -- ALLOWLIST para o próprio usuário: name, avatar_color,
  -- telefone_whatsapp, fuso_horario e updated_at. Todo o resto é restaurado.
  NEW.id                       := OLD.id;
  NEW.created_at               := OLD.created_at;
  NEW.email_cache              := OLD.email_cache;
  NEW.cargo                    := OLD.cargo;
  NEW.cargo_id                 := OLD.cargo_id;
  NEW.gestor_id                := OLD.gestor_id;
  NEW.equipe_id                := OLD.equipe_id;
  NEW.supervisor_escopo        := OLD.supervisor_escopo;
  NEW.ativo                    := OLD.ativo;
  NEW.deleted_at               := OLD.deleted_at;
  NEW.deleted_by               := OLD.deleted_by;
  NEW.senha_reset_exigido      := OLD.senha_reset_exigido;
  NEW.limite_leads_simultaneos := OLD.limite_leads_simultaneos;
  NEW.canais_entrada           := OLD.canais_entrada;
  NEW.xerife_isento            := OLD.xerife_isento;
  NEW.telegram_chat_id         := OLD.telegram_chat_id;
  NEW.telegram_vinculo_codigo  := OLD.telegram_vinculo_codigo;
  NEW.ultimo_acesso_em         := OLD.ultimo_acesso_em;

  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------
-- 3) Auditoria de profiles.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_profiles_auditoria()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _campo text;
  _ant text;
  _novo text;
BEGIN
  FOREACH _campo IN ARRAY ARRAY[
    'equipe_id','supervisor_escopo','gestor_id','cargo_id','cargo',
    'xerife_isento','ativo','deleted_at','senha_reset_exigido',
    'limite_leads_simultaneos','telegram_chat_id','email_cache','name'
  ] LOOP
    EXECUTE format('SELECT ($1).%I::text, ($2).%I::text', _campo, _campo)
      INTO _ant, _novo USING OLD, NEW;

    IF _ant IS DISTINCT FROM _novo THEN
      INSERT INTO public.user_audit_log (alvo_user_id, ator_user_id, campo, valor_anterior, valor_novo)
      VALUES (NEW.id, auth.uid(), _campo, _ant, _novo);
    END IF;
  END LOOP;

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  PERFORM public.log_falha_trigger('tg_profiles_auditoria', SQLERRM,
          jsonb_build_object('alvo', NEW.id));
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS profiles_auditoria ON public.profiles;
CREATE TRIGGER profiles_auditoria
  AFTER UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_profiles_auditoria();

-- ---------------------------------------------------------------------
-- 4) Revoga a execução ANÔNIMA de funções SECURITY DEFINER.
-- ---------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.localizar_lead_ativo(text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cnpj_status(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cnpj_status(text, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.log_falha_trigger(text, text, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mover_etapa_lead(uuid, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reagendar_lead(uuid, timestamp with time zone, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.chat_supervisor_id() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.localizar_lead_ativo(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cnpj_status(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cnpj_status(text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.log_falha_trigger(text, text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mover_etapa_lead(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reagendar_lead(uuid, timestamp with time zone, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.chat_supervisor_id() TO authenticated, service_role;