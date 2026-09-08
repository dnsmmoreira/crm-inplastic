CREATE OR REPLACE FUNCTION public.tg_tarefas_protect()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.origem = 'xerife' AND OLD.tipo LIKE 'pos_venda_%' THEN
      RAISE EXCEPTION 'Tarefas de pós-venda não podem ser deletadas — apenas concluídas com nota.';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status = 'concluida' AND OLD.status <> 'concluida' THEN
    IF NEW.origem = 'xerife' AND NEW.tipo LIKE 'pos_venda_%'
       AND COALESCE(NEW.desfecho, '') <> 'automatico'
       AND (NEW.nota_conclusao IS NULL OR btrim(NEW.nota_conclusao) = '') THEN
      RAISE EXCEPTION 'Conclusão de tarefa de pós-venda exige nota de conclusão preenchida.';
    END IF;
  END IF;

  RETURN NEW;
END; $function$;

UPDATE public.tarefas
   SET pedido_id = substring(descricao from '\[pedido:([0-9a-f-]{36})\]')::uuid
 WHERE pedido_id IS NULL
   AND descricao ~ '\[pedido:[0-9a-f-]{36}\]';

UPDATE public.pedidos
   SET equipe_responsavel = NULL
 WHERE equipe_responsavel = 'Julia (Operações)';