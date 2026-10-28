-- Applies only on Supabase: needs the storage schema.

update storage.buckets
set allowed_mime_types = array['application/epub+zip', 'text/plain']
where id = 'exports';
