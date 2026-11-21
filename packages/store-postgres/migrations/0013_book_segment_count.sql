-- Lets the library decide "fully translated" without loading every parsed book.
alter table public.books add column if not exists segment_count integer not null default 0;
update public.books
set segment_count = coalesce(jsonb_array_length(parsed_json -> 'segments'), 0)
where segment_count = 0;
