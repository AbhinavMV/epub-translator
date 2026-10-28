-- Applies only on Supabase: needs the storage schema.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('books', 'books', false, 52428800, array['application/epub+zip']),
  ('exports', 'exports', false, 52428800, array['application/epub+zip'])
on conflict (id) do nothing;

drop policy if exists et_objects_select_own on storage.objects;
create policy et_objects_select_own on storage.objects
  for select to authenticated
  using (
    bucket_id in ('books', 'exports')
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists et_objects_insert_own on storage.objects;
create policy et_objects_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('books', 'exports')
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists et_objects_delete_own on storage.objects;
create policy et_objects_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('books', 'exports')
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );
