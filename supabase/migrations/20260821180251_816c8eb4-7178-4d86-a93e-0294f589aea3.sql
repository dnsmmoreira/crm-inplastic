-- ROLLBACK:
--   DROP INDEX IF EXISTS public.idx_notificacoes_pendentes_aceite;
--   ALTER TABLE public.notificacoes DROP COLUMN IF EXISTS exige_aceite;
--   ALTER TABLE public.notificacoes DROP COLUMN IF EXISTS aceito_em;
--   ALTER TABLE public.notificacoes DROP COLUMN IF EXISTS adiado_ate;
--   (e restaurar tg_conversa_atribuida_notifica sem a coluna exige_aceite no INSERT)

ALTER TABLE public.notificacoes
  ADD COLUMN IF NOT EXISTS exige_aceite boolean NOT NULL DEFAULT false;
ALTER TABLE public.notificacoes
  ADD COLUMN IF NOT EXISTS aceito_em timestamptz;
ALTER TABLE public.notificacoes
  ADD COLUMN IF NOT EXISTS adiado_ate timestamptz;

CREATE INDEX IF NOT EXISTS idx_notificacoes_pendentes_aceite
  ON public.notificacoes (user_id, exige_aceite, aceito_em, adiado_ate);

UPDATE public.notificacoes
   SET exige_aceite = true
 WHERE tipo LIKE 'pedido_%'
   AND lida_em IS NULL;

CREATE OR REPLACE FUNCTION public.tg_conversa_atribuida_notifica()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.atribuido_para IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.atribuido_para IS DISTINCT FROM NEW.atribuido_para) THEN
    NEW.atribuido_em := now();
    INSERT INTO public.notificacoes (user_id, tipo, conversa_id, titulo, exige_aceite)
    VALUES (
      NEW.atribuido_para,
      'conversa_atribuida',
      NEW.id,
      'Nova conversa atribuída' || COALESCE(' — ' || NEW.name, ''),
      true
    );
  END IF;
  RETURN NEW;
END;
$function$;