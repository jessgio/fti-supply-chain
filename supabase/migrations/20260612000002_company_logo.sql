-- Company logo for PO PDF printouts

alter table public.company_settings
  add column logo_path text;

insert into storage.buckets (id, name, public, file_size_limit)
values ('company-assets', 'company-assets', false, 2097152)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit;
