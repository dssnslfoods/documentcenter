-- VAT master data + VAT snapshot on projects

create table if not exists public.vat_rates (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label text not null,
  rate numeric(5,2) not null check (rate >= 0 and rate <= 100),
  is_default boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on public.vat_rates to authenticated;
grant select on public.vat_rates to anon;
grant all on public.vat_rates to service_role;

alter table public.vat_rates enable row level security;

drop policy if exists "vat_rates_read" on public.vat_rates;
create policy "vat_rates_read" on public.vat_rates for select to authenticated using (true);

drop policy if exists "vat_rates_write" on public.vat_rates;
create policy "vat_rates_write" on public.vat_rates for all to authenticated using (true) with check (true);

insert into public.vat_rates (code, label, rate, is_default, sort_order)
values ('VAT001', 'VAT 7%', 7.00, true, 10)
on conflict (code) do nothing;

-- Snapshot VAT on each project (historical rates are not affected by later changes)
alter table public.projects
  add column if not exists vat_rate numeric(5,2),
  add column if not exists vat_amount numeric(14,2),
  add column if not exists contract_value_incl_vat numeric(14,2);

comment on column public.projects.vat_rate is 'VAT % snapshot at time of entry (no retroactive change)';
