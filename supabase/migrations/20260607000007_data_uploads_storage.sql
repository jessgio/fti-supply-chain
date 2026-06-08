-- Private bucket for large Excel uploads (browser -> Storage direct, server processes).
insert into storage.buckets (id, name, public, file_size_limit)
values ('data-uploads', 'data-uploads', false, 104857600)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit;
