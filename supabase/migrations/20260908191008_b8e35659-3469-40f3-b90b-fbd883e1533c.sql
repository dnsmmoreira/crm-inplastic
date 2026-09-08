CREATE OR REPLACE FUNCTION public.tg_tarefas_sync()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Rede de segurança: qualquer escrita que mexa só em `done` vira estado oficial.
  IF TG_OP = 'UPDATE'
     AND NEW.done IS DISTINCT FROM OLD.done
     AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    IF NEW.done AND NEW.status IN ('pendente','adiada') THEN
      NEW.status := 'concluida';
      IF NEW.concluida_at IS NULL THEN NEW.concluida_at := now(); END IF;
      IF NEW.desfecho IS NULL THEN NEW.desfecho := 'manual'; END IF;
    ELSIF NOT NEW.done AND NEW.status = 'concluida' THEN
      NEW.status := 'pendente';
      NEW.concluida_at := NULL;
    END IF;
  END IF;

  IF NEW.status = 'concluida' THEN
    NEW.done := true;
    IF NEW.concluida_at IS NULL THEN NEW.concluida_at := now(); END IF;
  ELSIF NEW.status IN ('pendente','adiada') THEN
    NEW.done := false;
  END IF;

  IF NEW.descricao IS NULL OR NEW.descricao = '' THEN NEW.descricao := NEW.title; END IF;
  IF NEW.title IS NULL OR NEW.title = '' THEN NEW.title := COALESCE(NEW.descricao, ''); END IF;

  IF NEW.kind IS NULL AND NEW.tipo IS NOT NULL THEN NEW.kind := NEW.tipo; END IF;
  IF NEW.tipo IS NULL AND NEW.kind IS NOT NULL THEN NEW.tipo := NEW.kind; END IF;

  NEW.auto_generated := (NEW.origem = 'xerife');

  RETURN NEW;
END; $function$;