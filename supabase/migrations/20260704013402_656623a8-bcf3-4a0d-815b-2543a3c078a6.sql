
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _is_first BOOLEAN;
  _display_name TEXT;
  _invited_role TEXT;
  _final_role public.app_role;
BEGIN
  _display_name := COALESCE(
    NEW.raw_user_meta_data->>'name',
    NEW.raw_user_meta_data->>'full_name',
    split_part(NEW.email, '@', 1)
  );

  INSERT INTO public.profiles (id, name)
  VALUES (NEW.id, _display_name);

  SELECT NOT EXISTS(SELECT 1 FROM public.user_roles) INTO _is_first;
  _invited_role := NEW.raw_user_meta_data->>'role';

  IF _is_first THEN
    _final_role := 'admin'::public.app_role;
  ELSIF _invited_role IN ('admin', 'vendedor') THEN
    _final_role := _invited_role::public.app_role;
  ELSE
    _final_role := 'vendedor'::public.app_role;
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, _final_role);

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
