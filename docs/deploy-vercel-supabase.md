# Deploy on Vercel Hobby + Supabase Free

Hosted mode is invite-only, with one private library per user. Translation runs in each user's browser with their own provider keys, so the server never stores or sees them.

Architecture in one paragraph: Vercel serves the Vite build as the `web` service and the Hono API (`apps/api/src/index.ts`) as the `api` service, both declared in the root `vercel.json` (Vercel Services, beta). Postgres and Storage live in Supabase. EPUBs go browser to Supabase Storage through signed upload URLs, and exports come back through signed download URLs, because Vercel functions cap request and response bodies at 4.5 MB.

## 1. Apply the database schema

### A new Supabase project

1. Open the Supabase dashboard, SQL editor, new query.
2. Paste the whole of `packages/store-postgres/migrations/all.sql` and run it. It runs every migration through 0013: the tables (including `projects` and `project_settings`, which hold each project's glossary, custom prompt and glossary conflicts), row-level security, the private `et_owner` role, the private `books` and `exports` buckets with per-user folder policies, and the rate-limit table. A new project has no books, so the project scripts below are not needed.
3. Re-run is safe for the storage parts; for the tables, apply it once. When a migration is added, regenerate the bundle with `pnpm --filter @et/store-postgres db:bundle`; an existing project pastes only the matching `apply-NNNN.sql` file.

### Upgrading an existing Supabase project

Find the last migration the project ran and paste each later `packages/store-postgres/migrations/apply-NNNN.sql` in the SQL editor, in this order. Every `apply-` file is safe to run more than once.

1. **apply-0007** (after 0006). Creates the private `et_owner` role that the server assumes for every library query, revokes the library tables from `anon` and `authenticated`, drops the `storage.objects` policies and locks down `schema_migrations`.
2. **apply-0008** (after 0007). Adds the `proofreads` table that stores AI proofreading suggestions, owner-scoped for `et_owner` like the other library tables.
3. **apply-0009** (after 0008). Adds the owner-scoped `projects` table and a nullable project and volume number on `books`.
4. **apply-0010** (after 0009). Adds the owner-scoped `project_settings` table that holds each project's glossary, custom prompt and glossary conflicts.
5. **apply-0011** (after 0010). Adds `series_title` to `projects`, which import uses to suggest a project whose books were all deleted, even after a rename.
6. **apply-0013** (after 0011; it does not wait for 0012). Adds `segment_count` to `books`, filled from each stored book, so the library can tell which projects are fully translated without loading every book. Paste it again once this code is deployed: a book that older code imported in between is left at 0.
7. **Deploy this code.** Apply 0009 to 0011 and 0013 first: every translation request reads `project_settings`, every import preview and the backfill read `series_title`, every import writes `segment_count`, and older code keeps working with the new columns and tables. Until step 9 has run, translations use no glossary or custom prompt.
8. **Place the existing books in projects.** With the API's `DATABASE_URL` set, `pnpm --filter @et/api backfill:projects --postgres` prints, per user, the proposed projects and volume numbers without writing; add `--apply` to write them. It also fills the series title of projects created before 0011. Applying again changes nothing. `--owner <uuid>` limits either script to one user.
9. **Move the glossary and custom prompt each book had before projects onto its project.** `pnpm --filter @et/api merge:project-settings --postgres` prints, per project, the merged glossary, the custom prompt and every glossary conflict without writing; add `--apply` to write them. Where volumes disagree on a term, the higher volume's rendering stays in force and the others are recorded as a glossary conflict for the reader to resolve. The merge writes nothing for a user while any of their books has no project (run step 8 first), skips a project whose glossary or custom prompt has already been saved, so applying again keeps later edits, and leaves out a project whose merged glossary exceeds 2,000 entries (the script names it). The books' own settings rows are left in place.
10. **apply-0012**, last. Makes `books.project_id` NOT NULL. It fails, changing nothing, while any book still has no project, which happens if older code imported a book after step 8; run step 8 with `--apply` again and paste it again.

In short, for a project that last ran 0008: apply-0009, apply-0010, apply-0011, apply-0013, deploy, `backfill:projects --postgres --apply`, `merge:project-settings --postgres --apply`, apply-0012. Run each script without `--apply` first to review its plan. `pnpm --filter @et/store-postgres db:migrate` on a library that is not yet backfilled applies up to 0011 and then stops with an error at 0012, leaving it and 0013 unrecorded; paste apply-0013 by hand before deploying, and re-run it after the backfill.

The Data API (PostgREST) and direct Storage access are therefore no longer usable for the library tables by design: a user's JWT plus the public publishable key reach nothing but their own `app_users` row. All reads and writes go through this app's API, and the browser only uses signed upload URLs.

### Check the JWT signing keys

Settings, JWT Keys. The project should sign with an asymmetric key (ES256, shown as the current key under JWT Signing Keys); the API verifies tokens against the project's JWKS. If the project still shows the legacy HS256 shared secret, use "Migrate JWT secret" to create a signing key, rotate to it, and only then revoke the legacy secret. Existing sessions stay valid during rotation.

## 2. Create the first admin

Authentication, Users, Add user, Create new user. Enter the email you will put in `ADMIN_EMAILS`, a password of at least 10 characters, and tick Auto Confirm User. Sign-ups and email confirmation should stay off (Authentication, Providers/Sign In).

The first sign-in of an email listed in `ADMIN_EMAILS` provisions its `app_users` row as admin. Invites cannot be accepted for an `ADMIN_EMAILS` address.

Then open Authentication, URL Configuration: set Site URL to your `APP_URL` and add `APP_URL` (and `APP_URL/**`) to Redirect URLs, so recovery links land on the app.

## 3. Collect the keys

| Variable | Where to copy it | Vercel type |
| --- | --- | --- |
| `SUPABASE_URL` | Project Settings, API, Project URL | Config |
| `SUPABASE_PUBLISHABLE_KEY` | Project Settings, API Keys, publishable key | Config |
| `SUPABASE_SECRET_KEY` | Project Settings, API Keys, secret key | Secret (sensitive) |
| `DATABASE_URL` | Connect, Transaction pooler (port 6543), with your database password | Secret (sensitive) |
| `ADMIN_EMAILS` | The admin email(s) from step 2 | Config |
| `ALLOWED_HOSTS` | Your Vercel domain, e.g. `epub-translator.vercel.app` | Config |
| `APP_URL` | `https://` plus the same domain | Config |
| `AUTH_MODE` | Literal `supabase` | Config |

A template with blank values is in `apps/api/.env.hosted.example`. Never use the legacy `service_role` key.

## 4. Import the repository on Vercel

1. Vercel, Add New, Project, import the GitHub repository.
2. Leave Root Directory at the repository root and Framework Preset on Other. The root `vercel.json` defines both services, their install and build commands, the `bom1` (Mumbai) function region, the rewrites and the security headers. It also turns off Git deployments for every branch except `main`, so pull requests get no preview deployment.
3. Add the environment variables above for Production. Branches other than `main` do not deploy; if you deploy a preview by hand (`vercel deploy`), add the variables for Preview too. Previews share the production database and storage, so keep Standard Deployment Protection on.
4. Deploy. If Services is not enabled for your account, enable it under Project Settings, or use the fallback in the section below.
5. Set `ALLOWED_HOSTS` and `APP_URL` to the assigned domain and redeploy. A request whose Host is not listed gets a 403, including preview URLs unless you list them.

`pnpm build` (turbo) builds every package, and the `web` service runs `pnpm turbo run build --filter=@et/web...`. The API needs no build step: Vercel bundles `src/index.ts`.

## 5. Protect the deployment

Project Settings, Deployment Protection, enable Standard Protection (Vercel Authentication) so preview deployments are not public. Logs record query strings, so no secret is ever placed in a URL by this app; the signed export link is short lived (300 seconds).

## 6. First sign-in and invites

1. Open the domain and sign in with the admin account.
2. Open **Settings → Admin**, create an invite (optionally bound to an email, default 72 hours) and send the link to the person yourself. Invites and users are listed as rows with their status and actions; on a phone each row stacks, so the page works on any screen.
3. They open the link, choose a password and sign in. Each user then opens **Settings → API keys**, unlocks or creates their own browser key vault and adds a provider key. Keys never leave their browser.
4. Password recovery is an admin-generated link (**Reset link** on the user's row in Admin); there is no email sending, and the sign-in page tells users to ask the person who invited them. Whoever holds such a link can set the password and sign in as that user, so an admin can always sign in as any user (provider keys still stay in the user's browser vault and are not reachable that way, but books and translations are). Send reset links over a channel you trust.

## Fallback if Services is unavailable

Move the API into a Vercel function under `api/` that re-exports the Hono app, drop the `services` block in favour of `buildCommand`/`outputDirectory` for `apps/web`, and keep the same `rewrites`, `headers` and `regions`. The application code does not change.

## Operations notes

- Supabase Free pauses the project after a week of inactivity and has an egress allowance; each instance keeps a 64 MB cache of recently read EPUBs to reduce reads.
- Exports older than 24 hours are removed on the owner's next export.
- Uploads are limited to 50 MB, matching the bucket limit. Upload tickets are limited to 30 per user per hour, and unfinished uploads older than 2 hours are removed on the owner's next import.
