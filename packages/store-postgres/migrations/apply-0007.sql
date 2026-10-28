do $$ begin
  if not exists (select from pg_roles where rolname = 'et_owner') then
    create role et_owner nologin;
  end if;
  if exists (select from pg_roles where rolname = 'postgres') then
    grant et_owner to postgres;
  end if;
  if exists (select from pg_namespace where nspname = 'auth') then
    grant usage on schema auth to et_owner;
    grant execute on function auth.uid() to et_owner;
  end if;
end $$;

grant usage on schema public to et_owner;

revoke all on public.books, public.book_settings, public.jobs, public.translations,
  public.provider_batches, public.work_leases from anon, authenticated;
grant select, insert, update, delete on public.books, public.book_settings, public.jobs,
  public.translations, public.provider_batches, public.work_leases to et_owner;

drop policy if exists books_owner on public.books;
create policy books_owner on public.books
  for all to et_owner
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

drop policy if exists book_settings_owner on public.book_settings;
create policy book_settings_owner on public.book_settings
  for all to et_owner
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

drop policy if exists jobs_owner on public.jobs;
create policy jobs_owner on public.jobs
  for all to et_owner
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

drop policy if exists translations_owner on public.translations;
create policy translations_owner on public.translations
  for all to et_owner
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

drop policy if exists provider_batches_owner on public.provider_batches;
create policy provider_batches_owner on public.provider_batches
  for all to et_owner
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

drop policy if exists work_leases_owner on public.work_leases;
create policy work_leases_owner on public.work_leases
  for all to et_owner
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create table if not exists public.schema_migrations (
  name text primary key,
  applied_at timestamptz not null default now()
);
alter table public.schema_migrations enable row level security;
revoke all on public.schema_migrations from anon, authenticated;

do $$ begin
  if to_regclass('storage.objects') is not null then
    drop policy if exists et_objects_select_own on storage.objects;
    drop policy if exists et_objects_insert_own on storage.objects;
    drop policy if exists et_objects_delete_own on storage.objects;
  end if;
end $$;
