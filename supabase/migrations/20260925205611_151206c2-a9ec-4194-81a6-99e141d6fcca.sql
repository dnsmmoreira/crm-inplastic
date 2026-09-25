alter table public.tarefas drop constraint if exists tarefas_origem_chk;
alter table public.tarefas add constraint tarefas_origem_chk
  check (origem = any (array['manual','xerife','pedido_fluxo','proposta_fluxo']));