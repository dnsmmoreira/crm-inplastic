ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS cargo_id uuid NULL REFERENCES public.cargos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS gestor_id uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS profiles_gestor_id_idx ON public.profiles(gestor_id);
CREATE INDEX IF NOT EXISTS profiles_cargo_id_idx ON public.profiles(cargo_id);