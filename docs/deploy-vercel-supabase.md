# Deploy on Vercel Hobby + Supabase Free

Hosted mode is invite-only, with one private library per user. Translation runs in each user's browser with their own provider keys, so the server never stores or sees them.

Architecture in one paragraph: Vercel serves the Vite build as the `web` service and the Hono API (`apps/api/src/index.ts`) as the `api` service, both declared in the root `vercel.json` (Vercel Services, beta). Postgres and Storage live in Supabase. EPUBs go browser to Supabase Storage through signed upload URLs, and exports come back through signed download URLs, because Vercel functions cap request and response bodies at 4.5 MB.

## 1. Apply the database schema

1. Open the Supabase dashboard, SQL editor, new query.
2. Paste the whole of `packages/store-postgres/migrations/all.sql` and run it. It creates the tables, row-level security, the private `books` and `exports` buckets with per-user folder policies, and the rate-limit table.
3. Re-run is safe for the storage parts; for the tables, apply it once. After later migrations, regenerate the bundle with `pnpm --filter @et/store-postgres db:bundle` and paste only the new files.
4. If the project already ran migrations 0001 to 0006, paste `packages/store-postgres/migrations/apply-0007.sql` (safe to run more than once). It creates the private `et_owner` role that the server assumes for every library query, revokes the library tables from `anon` and `authenticated`, drops the `storage.objects` policies and locks down `schema_migrations`.

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
2. Leave Root Directory at the repository root and Framework Preset on Other. The root `vercel.json` defines both services, their install and build commands, the `bom1` (Mumbai) function region, the rewrites and the security headers.
3. Add the environment variables above for Production and Preview. Previews share the production database and storage, so keep Standard Deployment Protection on.
4. Deploy. If Services is not enabled for your account, enable it under Project Settings, or use the fallback in the section below.
5. Set `ALLOWED_HOSTS` and `APP_URL` to the assigned domain and redeploy. A request whose Host is not listed gets a 403, including preview URLs unless you list them.

`pnpm build` (turbo) builds every package, and the `web` service runs `pnpm turbo run build --filter=@et/web...`. The API needs no build step: Vercel bundles `src/index.ts`.

## 5. Protect the deployment

Project Settings, Deployment Protection, enable Standard Protection (Vercel Authentication) so preview deployments are not public. Logs record query strings, so no secret is ever placed in a URL by this app; the signed export link is short lived (300 seconds).

## 6. First sign-in and invites

1. Open the domain and sign in with the admin account.
2. Open Admin, create an invite (optionally bound to an email, default 72 hours) and send the link to the person yourself.
3. They open the link, choose a password and sign in. Each user then unlocks or creates their own browser key vault in the app and adds a provider key. Keys never leave their browser.
4. Password recovery is an admin-generated link from the Admin page; there is no email sending. Whoever holds such a link can set the password and sign in as that user, so an admin can always sign in as any user (provider keys still stay in the user's browser vault and are not reachable that way, but books and translations are). Send reset links over a channel you trust.

## Fallback if Services is unavailable

Move the API into a Vercel function under `api/` that re-exports the Hono app, drop the `services` block in favour of `buildCommand`/`outputDirectory` for `apps/web`, and keep the same `rewrites`, `headers` and `regions`. The application code does not change.

## Operations notes

- Supabase Free pauses the project after a week of inactivity and has an egress allowance; each instance keeps a 64 MB cache of recently read EPUBs to reduce reads.
- Exports older than 24 hours are removed on the owner's next export.
- Uploads are limited to 50 MB, matching the bucket limit. Upload tickets are limited to 30 per user per hour, and unfinished uploads older than 2 hours are removed on the owner's next import.
