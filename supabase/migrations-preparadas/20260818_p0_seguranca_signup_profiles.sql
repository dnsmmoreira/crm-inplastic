-- =====================================================================
-- P0 DE SEGURANÇA — MIGRATION ADITIVA **PREPARADA / NÃO APLICADA**
-- Revisar e aprovar antes de executar. Não edita migrations antigas.
--
-- 1) Trigger de signup nunca confia em raw_user_meta_data.role.
-- 2) Usuário público nasce no máximo como 'vendedor'.
-- 3) Promoção a admin somente por operação de administrador autenticado.
-- 4) Usuário comum não altera campos administrativos de profiles.
-- =====================================================================

-- ── 1) Trigger de signup sem confiança no metadata ────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _is_first BOOLEAN;
  _display_name TEXT;
BEGIN
  _display_name := COALESCE(
    NEW.raw_user_meta_data->>'name',
    NEW.raw_user_meta_data->>'full_name',
    split_part(NEW.email, '@', 1)
  );

  INSERT INTO public.profiles (id, name)
  VALUES (NEW.id, _display_name);

  SELECT NOT EXISTS(SELECT 1 FROM public.user_roles) INTO _is_first;

  -- O papel NUNCA vem de raw_user_meta_data. Só o primeiro usuário do
  -- projeto (bootstrap) nasce admin; qualquer outro nasce 'vendedor'.
  INSERT INTO public.user_roles (user_id, role)
  VALUES (
    NEW.id,
    CASE WHEN _is_first THEN 'admin'::public.app_role ELSE 'vendedor'::public.app_role END
  );

  RETURN NEW;
END;
$function$;

-- ── 2) Promoção a admin só por administrador autenticado ──────────────
CREATE OR REPLACE FUNCTION public.tg_user_roles_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _novo public.app_role := COALESCE(NEW.role, OLD.role);
BEGIN
  -- Chamadas internas (trigger de signup, service_role, jobs) seguem livres.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF _novo = 'admin'::public.app_role AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Somente administradores podem conceder o papel admin.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_roles_guard_ins ON public.user_roles;
CREATE TRIGGER user_roles_guard_ins
  BEFORE INSERT ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.tg_user_roles_guard();

DROP TRIGGER IF EXISTS user_roles_guard_upd ON public.user_roles;
CREATE TRIGGER user_roles_guard_upd
  BEFORE UPDATE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.tg_user_roles_guard();

-- ── 3) Profiles: usuário comum só edita campos pessoais ───────────────
CREATE OR REPLACE FUNCTION public.tg_profiles_admin_fields_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  -- Campos administrativos: preservados à força para não-admins.
  NEW.ativo                := OLD.ativo;
  NEW.deleted_at           := OLD.deleted_at;
  NEW.senha_reset_exigido  := OLD.senha_reset_exigido;
  NEW.id                   := OLD.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_admin_fields_guard ON public.profiles;
CREATE TRIGGER profiles_admin_fields_guard
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_profiles_admin_fields_guard();

-- ── 4) Política de UPDATE própria explícita (aditiva) ─────────────────
DROP POLICY IF EXISTS "profiles_self_update_campos_pessoais" ON public.profiles;
CREATE POLICY "profiles_self_update_campos_pessoais"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid() AND ativo IS NOT FALSE AND deleted_at IS NULL)
  WITH CHECK (id = auth.uid());
