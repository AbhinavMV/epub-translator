-- books.project_id stays nullable here: existing books are placed in projects by the
-- backfill script after this runs, and a later migration can make it NOT NULL.

create table if not exists public.projects (
  owner_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  name text not null,
  created_at timestamptz not null,
  primary key (owner_id, id)
);

alter table public.projects enable row level security;
revoke all on public.projects from anon, authenticated;
grant select, insert, update, delete on public.projects to et_owner;

drop policy if exists projects_owner on public.projects;
create policy projects_owner on public.projects
  for all to et_owner
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

alter table public.books add column if not exists project_id text;
alter table public.books add column if not exists volume_number double precision;

do $$ begin
  if not exists (select from pg_constraint where conname = 'books_project_fkey') then
    alter table public.books add constraint books_project_fkey
      foreign key (owner_id, project_id) references public.projects (owner_id, id);
  end if;
end $$;

create index if not exists books_project
  on public.books (owner_id, project_id, volume_number, created_at);
