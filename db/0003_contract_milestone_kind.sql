-- Phase 3+: distinguish delivery vs billing milestones
alter table public.contract_milestones
  add column if not exists kind text not null default 'delivery'
  check (kind in ('delivery','billing'));

alter table public.contract_milestones
  add column if not exists sort_order integer not null default 0;

alter table public.contract_milestones
  add column if not exists notes text;
