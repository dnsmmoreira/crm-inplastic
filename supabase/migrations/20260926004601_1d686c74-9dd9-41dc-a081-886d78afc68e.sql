alter table public.notificacoes add column if not exists sobre_user_id uuid references public.profiles(id) on delete set null;
create index if not exists notificacoes_sobre_idx on public.notificacoes (tipo, sobre_user_id) where lida_em is null;

update public.notificacoes set sobre_user_id = nullif(substring(titulo from '/equipe\?u=([0-9a-f-]{36})'), '')::uuid
 where tipo = 'tarefas_vencidas_escalado' and lida_em is null and sobre_user_id is null and titulo ~ '/equipe\?u='
   and exists (select 1 from public.profiles p where p.id::text = substring(titulo from '/equipe\?u=([0-9a-f-]{36})'));

create or replace function public.encerrar_avisos(_tipos text[], _coluna text, _id uuid)
returns integer language plpgsql security definer set search_path to 'public' as $$
declare n integer;
begin
  if _id is null or _coluna not in ('pedido_id','conversa_id','lead_id','proposta_id','sobre_user_id') then return 0; end if;
  execute format(
    'update public.notificacoes set lida_em = now()
      where lida_em is null and tipo = any($1) and %I = $2', _coluna)
  using _tipos, _id;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.encerrar_avisos(text[], text, uuid) from public, anon, authenticated;

create or replace function public.tg_perfil_canal_encerrar_avisos()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  begin
    if coalesce(old.telegram_chat_id,'') = '' and coalesce(new.telegram_chat_id,'') <> '' then
      update public.notificacoes set lida_em = now()
       where lida_em is null and tipo = 'aceites_sem_canal'
         and titulo like coalesce(new.name,'@@') || '%';
    end if;
  exception when others then null;
  end;
  return new;
end $$;
drop trigger if exists trg_perfil_canal_encerrar_avisos on public.profiles;
create trigger trg_perfil_canal_encerrar_avisos after update of telegram_chat_id on public.profiles
for each row execute function public.tg_perfil_canal_encerrar_avisos();
revoke all on function public.tg_perfil_canal_encerrar_avisos() from public, anon, authenticated;

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
    if (old.entrega_comprovada_em is null and new.entrega_comprovada_em is not null)
       or (old.comprovacao_dispensada_em is null and new.comprovacao_dispensada_em is not null) then
      update public.notificacoes set lida_em = now()
       where lida_em is null and pedido_id = new.id
         and tipo = 'pos_venda_sem_comprovacao_escalado';
    end if;
    if new.pos_venda_contato_em is not null
       and (new.entrega_comprovada_em is not null or new.comprovacao_dispensada_em is not null) then
      update public.notificacoes set lida_em = now()
       where lida_em is null and pedido_id = new.id and tipo = 'pos_venda_atrasado';
    end if;
  exception when others then null;
  end;
  return new;
end $$;
drop trigger if exists trg_pedido_encerrar_avisos on public.pedidos;
create trigger trg_pedido_encerrar_avisos after update of stage, encerrado_em,
  entrega_comprovada_em, comprovacao_dispensada_em, pos_venda_contato_em
on public.pedidos for each row execute function public.tg_pedido_encerrar_avisos();
revoke all on function public.tg_pedido_encerrar_avisos() from public, anon, authenticated;

update public.notificacoes set lida_em = now() where lida_em is null and id in (
  select id from (
    select id, row_number() over (
      partition by user_id, tipo, coalesce(sobre_user_id::text, '')
      order by created_at desc) rn
    from public.notificacoes
    where lida_em is null and aceito_em is null
      and tipo in ('tarefas_vencidas_escalado','aceites_sem_canal')
  ) x where rn > 1);