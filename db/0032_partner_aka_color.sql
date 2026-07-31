-- สีของป้าย AKA
alter table public.partners
  add column if not exists aka_color text;

alter table public.projects
  add column if not exists customer_aka_color text;

update public.projects p
set customer_aka_color = pt.aka_color
from public.partners pt
where p.customer_id = pt.id;

create or replace function public.sync_project_customer_aka()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.customer_id is not null then
    select aka, aka_color into new.customer_aka, new.customer_aka_color
    from public.partners where id = new.customer_id;
  else
    new.customer_aka := null;
    new.customer_aka_color := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_project_customer_aka on public.projects;
create trigger trg_sync_project_customer_aka
  before insert or update of customer_id on public.projects
  for each row execute function public.sync_project_customer_aka();

create or replace function public.propagate_partner_aka()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.aka is distinct from old.aka or new.aka_color is distinct from old.aka_color then
    update public.projects
      set customer_aka = new.aka, customer_aka_color = new.aka_color
      where customer_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_propagate_partner_aka on public.partners;
create trigger trg_propagate_partner_aka
  after update of aka, aka_color on public.partners
  for each row execute function public.propagate_partner_aka();
