-- 0001_users_and_invites.sql
create table if not exists public.app_users (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'user' check (role in ('admin', 'user')),
  disabled boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.invites (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  email text check (email is null or email = lower(email)),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid references auth.users (id) on delete set null
);

alter table public.app_users enable row level security;
alter table public.invites enable row level security;

drop policy if exists app_users_select_own on public.app_users;
create policy app_users_select_own on public.app_users
  for select to authenticated
  using ((select auth.uid()) = id);

revoke all on public.app_users from anon, authenticated;
revoke all on public.invites from anon, authenticated;
grant select on public.app_users to authenticated;

-- 0002_library_tables.sql
-- Every child references its parent through (owner_id, parent_id), so a row can never
-- point at another owner's parent. Primary keys lead with owner_id, which also serves as
-- the owner_id index that the RLS policies filter on.

create table if not exists public.books (
  owner_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  sha256 text not null,
  title text not null,
  author text,
  source_lang text,
  cover_href text,
  created_at timestamptz not null,
  parsed_json jsonb not null,
  blob_key text,
  primary key (owner_id, id),
  unique (owner_id, sha256)
);

create table if not exists public.book_settings (
  owner_id uuid not null references auth.users (id) on delete cascade,
  book_id text not null,
  json jsonb not null,
  primary key (owner_id, book_id),
  foreign key (owner_id, book_id) references public.books (owner_id, id) on delete cascade
);

create table if not exists public.jobs (
  owner_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  book_id text not null,
  target_lang text not null,
  source_lang text,
  error text,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  created_at timestamptz not null,
  primary key (owner_id, id),
  unique (owner_id, book_id, target_lang),
  foreign key (owner_id, book_id) references public.books (owner_id, id) on delete cascade
);

create table if not exists public.translations (
  owner_id uuid not null references auth.users (id) on delete cascade,
  job_id text not null,
  segment_id text not null,
  text text not null,
  status text not null check (status in ('done', 'flagged', 'failed')),
  note text,
  primary key (owner_id, job_id, segment_id),
  foreign key (owner_id, job_id) references public.jobs (owner_id, id) on delete cascade
);

create table if not exists public.provider_batches (
  owner_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  job_id text not null,
  chapter_id text not null,
  provider text not null,
  model text not null,
  vendor_batch_id text not null,
  status text not null,
  segment_ids jsonb not null,
  created_at timestamptz not null,
  primary key (owner_id, id),
  foreign key (owner_id, job_id) references public.jobs (owner_id, id) on delete cascade
);
create index if not exists provider_batches_open
  on public.provider_batches (owner_id, status, job_id, chapter_id);

create table if not exists public.work_leases (
  owner_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  job_id text not null,
  chapter_id text not null,
  segment_ids jsonb not null,
  leased_until timestamptz not null,
  primary key (owner_id, id),
  foreign key (owner_id, job_id) references public.jobs (owner_id, id) on delete cascade
);
create index if not exists work_leases_chapter
  on public.work_leases (owner_id, job_id, chapter_id, leased_until);

-- 0003_library_rls.sql
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

-- 0004_storage_supabase.sql
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

-- 0005_rate_limits.sql
create table if not exists public.rate_limits (
  key text not null,
  window_start timestamptz not null,
  count int not null default 0,
  primary key (key, window_start)
);

alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;

-- 0006_exports_text_supabase.sql
-- Applies only on Supabase: needs the storage schema.

update storage.buckets
set allowed_mime_types = array['application/epub+zip', 'text/plain']
where id = 'exports';

-- 0007_private_owner_role.sql
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
