alter table public.profiles
  add column if not exists recebe_alertas_gestao boolean not null default true;

comment on column public.profiles.recebe_alertas_gestao is
  'Quando false, a pessoa mantém a permissão usuarios.gerenciar mas NÃO recebe as notificações de gestão do Xerife/pedidos.';