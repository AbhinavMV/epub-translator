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
