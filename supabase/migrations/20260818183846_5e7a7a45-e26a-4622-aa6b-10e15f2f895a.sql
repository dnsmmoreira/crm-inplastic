ALTER TABLE public.arena_config
  RENAME COLUMN temporada_inicio TO arena_data_inicio;

ALTER TABLE public.arena_config
  ALTER COLUMN arena_data_inicio SET DEFAULT DATE '2026-09-01';

ALTER TABLE public.arena_config
  ADD COLUMN IF NOT EXISTS temporada_meses integer NOT NULL DEFAULT 3;

ALTER TABLE public.arena_config
  RENAME COLUMN rodada_piso_ativo TO piso_rodada_ativo;

ALTER TABLE public.arena_config
  RENAME COLUMN rodada_piso_pace_pct TO piso_rodada_pace_pct;

ALTER TABLE public.arena_config
  ALTER COLUMN piso_rodada_ativo SET DEFAULT false,
  ALTER COLUMN piso_rodada_pace_pct SET DEFAULT 50;

UPDATE public.arena_config
   SET arena_data_inicio    = DATE '2026-09-01',
       temporada_meses      = 3,
       piso_rodada_ativo    = false,
       piso_rodada_pace_pct = 50
 WHERE id = 1;

COMMENT ON COLUMN public.arena_config.arena_data_inicio IS
  'Inicio oficial da ARENA Premiacao (2026-09-01). Nada de premiacao ou rodada e computado antes desta data.';
COMMENT ON COLUMN public.arena_config.temporada_meses IS
  'Duracao da temporada em meses, contada a partir de arena_data_inicio (1a temporada: 2026-09-01 a 2026-11-30). Nao e trimestre-calendario.';
COMMENT ON COLUMN public.arena_config.piso_rodada_ativo IS
  'Piso de elegibilidade da rodada quinzenal. FALSE por decisao do Denis; ativacao prevista para janeiro/2027.';
COMMENT ON COLUMN public.arena_config.piso_rodada_pace_pct IS
  'Pace minimo (%) exigido para elegibilidade na rodada quinzenal quando piso_rodada_ativo = true.';