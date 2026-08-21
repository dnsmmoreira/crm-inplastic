-- Backfill dos efeitos de entrada de etapa dos 9 pedidos criados em 21/08/2026.
-- Somente os 2 em 'analise_financeira' têm destinatários; os 7 em 'programacao'
-- notificariam o perfil "Operacional Comercial", que não existe no banco.
-- Idempotente por (pedido_id, tipo, user_id).
with alvos as (
  select pr.id as user_id
  from profiles pr
  where pr.ativo and pr.deleted_at is null and pr.id in (
    select up.user_id
    from user_perfis up
    join perfis p on p.id = up.perfil_id and p.ativo
    join perfil_permissoes pp on pp.perfil_id = p.id
    where pp.permissao_chave = 'pedidos.movimentar'
  )
), ped as (
  select pe.id, pe.number, pe.total, coalesce(l.company, 'cliente') as cliente
  from pedidos pe
  left join leads l on l.id = pe.lead_id
  where pe.number in ('PED-2026-0024','PED-2026-0027')
    and pe.stage = 'analise_financeira'
)
insert into notificacoes (user_id, tipo, titulo, pedido_id)
select a.user_id,
       'pedido_aprovacao',
       left('Novo pedido para aprovação: ' || p.number || ' — ' || p.cliente || ' — ' ||
            to_char(p.total, 'FM"R$" 999G999G990D00'), 300),
       p.id
from ped p
cross join alvos a
where not exists (
  select 1 from notificacoes n
  where n.pedido_id = p.id and n.tipo = 'pedido_aprovacao' and n.user_id = a.user_id
);