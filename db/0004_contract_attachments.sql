-- Add link-only attachments to contracts (URL references, no file storage)
alter table public.contracts
  add column if not exists attachment_links jsonb not null default '[]'::jsonb;

comment on column public.contracts.attachment_links is
  'Array of { label: string, url: string } — external document links, not stored files.';
