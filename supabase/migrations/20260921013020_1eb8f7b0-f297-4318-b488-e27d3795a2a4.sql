CREATE OR REPLACE FUNCTION public.tg_profiles_cargo_texto()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.cargo_id IS NULL THEN
    NEW.cargo := NULL;
  ELSE
    SELECT c.nome INTO NEW.cargo FROM public.cargos c WHERE c.id = NEW.cargo_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_cargo_texto ON public.profiles;
CREATE TRIGGER profiles_cargo_texto
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_profiles_cargo_texto();