CREATE TYPE public.arena_tipo_comercial AS ENUM
  ('interno','representante','licitacoes','nao_comercial');

CREATE TABLE public.arena_participacao (
  user_id         uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  participa_arena boolean NOT NULL DEFAULT false,
  tipo_comercial  public.arena_tipo_comercial NOT NULL DEFAULT 'nao_comercial',
  carencia_inicio date,
  carencia_meses  int  NOT NULL DEFAULT 6 CHECK (carencia_meses >= 0),
  fase_rampa      int  NOT NULL DEFAULT 0 CHECK (fase_rampa >= 0),
  observacao      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.arena_participacao TO authenticated;
GRANT ALL ON public.arena_participacao TO service_role;

ALTER TABLE public.arena_participacao ENABLE ROW LEVEL SECURITY;

CREATE POLICY arena_part_select_admin_or_self ON public.arena_participacao
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role) OR user_id = auth.uid());
CREATE POLICY arena_part_insert_admin ON public.arena_participacao
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY arena_part_update_admin ON public.arena_participacao
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY arena_part_delete_admin ON public.arena_participacao
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'::app_role));

CREATE TRIGGER arena_participacao_updated_at
  BEFORE UPDATE ON public.arena_participacao
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

INSERT INTO public.arena_participacao
  (user_id, participa_arena, tipo_comercial, carencia_inicio, carencia_meses, fase_rampa)
SELECT p.id, true,
       CASE WHEN upper(p.name) LIKE 'KELLY%' THEN 'representante'
            ELSE 'interno' END::public.arena_tipo_comercial,
       CASE WHEN upper(p.name) LIKE ANY (ARRAY['PAMELA%','BEATRIZ%']) THEN DATE '2026-08-03' END,
       6,
       CASE WHEN upper(p.name) LIKE ANY (ARRAY['PAMELA%','BEATRIZ%']) THEN 1 ELSE 0 END
FROM public.profiles p
WHERE upper(p.name) LIKE ANY (ARRAY['BIANCA%','DANIEL%','KELLY%','PAMELA%','BEATRIZ%'])
ON CONFLICT (user_id) DO NOTHING;