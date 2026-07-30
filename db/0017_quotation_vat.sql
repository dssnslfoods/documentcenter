-- Quotation amounts are BEFORE VAT everywhere; store VAT snapshot + net (incl. VAT)

alter table public.customer_quotations
  add column if not exists vat_rate numeric(5,2),
  add column if not exists vat_amount numeric(14,2),
  add column if not exists amount_incl_vat numeric(14,2);

alter table public.supplier_quotations
  add column if not exists vat_rate numeric(5,2),
  add column if not exists vat_amount numeric(14,2),
  add column if not exists amount_incl_vat numeric(14,2);

alter table public.quotations
  add column if not exists vat_rate numeric(5,2);
