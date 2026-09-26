create or replace function public.encerrar_avisos(_tipos text[], _coluna text, _id uuid)
returns integer language plpgsql security definer set search_path to 'public' as $$
declare n integer;
begin
  if _id is null or _coluna not in ('pedido_id','conversa_id','lead_id','proposta_id') then return 0; end if;
  execute format(
    'update public.notificacoes set lida_em = now()
      where lida_em is null and tipo = any($1) and %I = $2', _coluna)
  using _tipos, _id;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.encerrar_avisos(text[], text, uuid) from public, anon, authenticated;

create or replace function public.tg_pedido_encerrar_avisos()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  begin
    if old.stage is distinct from new.stage
       or (old.encerrado_em is null and new.encerrado_em is not null) then
      update public.notificacoes set lida_em = now()
       where lida_em is null and pedido_id = new.id
         and (tipo in ('pedido_financeiro_escalado','pedido_aprovacao','aprovacao_pendente',
                       'pos_venda_sem_comprovacao_escalado','pos_venda_atrasado')
              or tipo like 'cadencia\_%');
    end if;
  exception when others then null;
  end;
  return new;
end $$;
drop trigger if exists trg_pedido_encerrar_avisos on public.pedidos;
create trigger trg_pedido_encerrar_avisos after update of stage, encerrado_em on public.pedidos
for each row execute function public.tg_pedido_encerrar_avisos();

create or replace function public.tg_conversa_encerrar_avisos()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  begin
    if (old.atribuido_para is null and new.atribuido_para is not null)
       or (old.status is distinct from new.status and new.status = 'encerrado') then
      perform public.encerrar_avisos(array['handoff_midia','handoff_sem_dono','conversa_sem_responsavel',
        'conversa_sem_resposta','conversa_espera_longa'], 'conversa_id', new.id);
    end if;
  exception when others then null;
  end;
  return new;
end $$;
drop trigger if exists trg_conversa_encerrar_avisos on public.whatsapp_conversas;
create trigger trg_conversa_encerrar_avisos after update of atribuido_para, status on public.whatsapp_conversas
for each row execute function public.tg_conversa_encerrar_avisos();

-- "Respondida": whatsapp_conversas não tem ultima_msg_vendedor_at; usa a mensagem do vendedor.
create or replace function public.tg_msg_vendedor_encerrar_avisos()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  begin
    if new.autor = 'vendedor' and new.direcao = 'saida' then
      perform public.encerrar_avisos(array['handoff_midia','handoff_sem_dono','conversa_sem_resposta',
        'conversa_espera_longa'], 'conversa_id', new.conversa_id);
    end if;
  exception when others then null;
  end;
  return new;
end $$;
drop trigger if exists trg_msg_vendedor_encerrar_avisos on public.whatsapp_mensagens;
create trigger trg_msg_vendedor_encerrar_avisos after insert on public.whatsapp_mensagens
for each row execute function public.tg_msg_vendedor_encerrar_avisos();

create or replace function public.tg_tarefa_encerrar_avisos()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  begin
    if new.status = 'concluida' and old.status is distinct from new.status then
      perform public.encerrar_avisos(array['tarefas_vencidas_escalado'], 'pedido_id', new.pedido_id);
      perform public.encerrar_avisos(array['tarefas_vencidas_escalado'], 'lead_id', new.lead_id);
    end if;
  exception when others then null;
  end;
  return new;
end $$;
drop trigger if exists trg_tarefa_encerrar_avisos on public.tarefas;
create trigger trg_tarefa_encerrar_avisos after update of status on public.tarefas
for each row execute function public.tg_tarefa_encerrar_avisos();

revoke all on function public.tg_pedido_encerrar_avisos() from public, anon, authenticated;
revoke all on function public.tg_conversa_encerrar_avisos() from public, anon, authenticated;
revoke all on function public.tg_msg_vendedor_encerrar_avisos() from public, anon, authenticated;
revoke all on function public.tg_tarefa_encerrar_avisos() from public, anon, authenticated;

-- Limpeza do passado: aviso cuja etapa já passou fica lido.
update public.notificacoes n set lida_em = now()
  from public.pedidos p
 where n.lida_em is null and n.pedido_id = p.id
   and (
     (n.tipo in ('pedido_financeiro_escalado','pedido_aprovacao','aprovacao_pendente')
        and (p.encerrado_em is not null or p.stage <> 'analise_financeira'))
     or (n.tipo in ('pos_venda_sem_comprovacao_escalado','pos_venda_atrasado')
        and (p.encerrado_em is not null or p.stage <> 'pos_venda'))
     or (n.tipo like 'cadencia\_%'
        and (p.encerrado_em is not null or n.tipo not like 'cadencia\_' || p.stage::text || '\_n%'))
   );

update public.notificacoes n set lida_em = now()
  from public.whatsapp_conversas c
 where n.lida_em is null and n.conversa_id = c.id
   and n.tipo in ('handoff_midia','handoff_sem_dono','conversa_sem_responsavel','conversa_sem_resposta','conversa_espera_longa')
   and (c.status = 'encerrado'
        or (n.tipo in ('handoff_sem_dono','conversa_sem_responsavel') and c.atribuido_para is not null));

-- Repetição: fica só o aviso mais novo não lido por pessoa + tipo + assunto.
update public.notificacoes n set lida_em = now()
 where n.lida_em is null and n.id in (
   select id from (
     select id, row_number() over (
       partition by user_id, tipo, coalesce(pedido_id, conversa_id, lead_id)::text,
         case when tipo = 'tarefas_vencidas_escalado' then split_part(titulo, ':', 1) else '' end
       order by created_at desc) rn
     from public.notificacoes
     where lida_em is null and aceito_em is null
       and tipo in ('handoff_midia','handoff_sem_dono','conversa_sem_responsavel','conversa_sem_resposta',
                    'conversa_espera_longa','tarefas_vencidas_escalado','pedido_financeiro_escalado',
                    'pos_venda_sem_comprovacao_escalado','pos_venda_atrasado')
       and (pedido_id is not null or conversa_id is not null or lead_id is not null or tipo = 'tarefas_vencidas_escalado')
   ) x where rn > 1);