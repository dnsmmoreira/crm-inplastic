alter table public.propostas
  add column if not exists encerramento_administrativo boolean not null default false;

comment on column public.propostas.encerramento_administrativo is
  'Proposta encerrada por arrumação interna (rascunho de lead já fechado, rascunho vazio, substituída). NÃO é perda comercial e não entra no relatório de perdas.';

update public.propostas
   set encerramento_administrativo = true
 where status = 'recusada'
   and (motivo_recusa in ('Duplicidade','Lead inválido') or reemitida_como is not null);