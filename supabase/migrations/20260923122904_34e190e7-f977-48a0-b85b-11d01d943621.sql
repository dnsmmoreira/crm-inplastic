alter table public.notificacoes
  add column if not exists lead_id uuid references public.leads(id) on delete set null;

create index if not exists idx_notificacoes_lead_id
  on public.notificacoes (lead_id) where lead_id is not null;