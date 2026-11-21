-- Import suggests an emptied project by the series it was made from, not by its name,
-- so a renamed project is still found. backfill:projects fills it for existing projects.
alter table public.projects add column if not exists series_title text;

create index if not exists projects_series_title on public.projects (owner_id, series_title);
