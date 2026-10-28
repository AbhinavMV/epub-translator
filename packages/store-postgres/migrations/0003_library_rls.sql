alter table public.books enable row level security;
alter table public.book_settings enable row level security;
alter table public.jobs enable row level security;
alter table public.translations enable row level security;
alter table public.provider_batches enable row level security;
alter table public.work_leases enable row level security;

drop policy if exists books_owner on public.books;
create policy books_owner on public.books
  for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

drop policy if exists book_settings_owner on public.book_settings;
create policy book_settings_owner on public.book_settings
  for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

drop policy if exists jobs_owner on public.jobs;
create policy jobs_owner on public.jobs
  for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

drop policy if exists translations_owner on public.translations;
create policy translations_owner on public.translations
  for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

drop policy if exists provider_batches_owner on public.provider_batches;
create policy provider_batches_owner on public.provider_batches
  for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

drop policy if exists work_leases_owner on public.work_leases;
create policy work_leases_owner on public.work_leases
  for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

revoke all on public.books, public.book_settings, public.jobs, public.translations,
  public.provider_batches, public.work_leases from anon;
grant select, insert, update, delete on public.books, public.book_settings, public.jobs,
  public.translations, public.provider_batches, public.work_leases to authenticated;
