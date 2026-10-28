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
