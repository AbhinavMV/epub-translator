create table if not exists public.proofreads (
  owner_id uuid not null references auth.users (id) on delete cascade,
  job_id text not null,
  chapter_id text not null,
  model text not null,
  created_at timestamptz not null,
  usage jsonb not null,
  suggestions jsonb not null,
  primary key (owner_id, job_id, chapter_id),
  foreign key (owner_id, job_id) references public.jobs (owner_id, id) on delete cascade
);

alter table public.proofreads enable row level security;
revoke all on public.proofreads from anon, authenticated;
grant select, insert, update, delete on public.proofreads to et_owner;

drop policy if exists proofreads_owner on public.proofreads;
create policy proofreads_owner on public.proofreads
  for all to et_owner
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
