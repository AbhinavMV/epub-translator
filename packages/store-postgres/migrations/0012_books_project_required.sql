-- Run only after backfill:projects --apply has placed every book in a project (and
-- merge:project-settings --apply has moved the glossaries); it fails while any book has none.
alter table public.books alter column project_id set not null;
