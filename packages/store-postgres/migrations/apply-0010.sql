create table if not exists public.project_settings (
  owner_id uuid not null references auth.users (id) on delete cascade,
  project_id text not null,
  json jsonb not null,
  primary key (owner_id, project_id),
  foreign key (owner_id, project_id) references public.projects (owner_id, id) on delete cascade
);

alter table public.project_settings enable row level security;
revoke all on public.project_settings from anon, authenticated;
grant select, insert, update, delete on public.project_settings to et_owner;

drop policy if exists project_settings_owner on public.project_settings;
create policy project_settings_owner on public.project_settings
  for all to et_owner
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
