# EPUB translator: Vercel + Supabase, invite-only, bring-your-own-key

Date: 2026-10-28. Scope: how to run the app for free on **Vercel Hobby** with **Supabase Free** (Postgres, Auth, Storage) as an invite-only, multi-user service where each user's library is private and each user's own Anthropic, OpenAI or Gemini key is **never stored or leaked server-side**, while `pnpm dev` (SQLite, filesystem, env keys) keeps working. Covers Vercel hosting and logging, Supabase limits, auth, RLS, storage and pooling, BYOK key handling, job execution without long-lived processes, invite UX, the data model, and an ordered implementation plan.

All facts come from primary sources: official docs and limits pages, API references, SDK source and typings installed in this repo, the Supabase Auth (GoTrue) source on GitHub (`supabase/auth` at `c3348e8`), W3C/WICG specs, OWASP, and the repo itself. Every page was read on **2026-10-28**. Limits are quoted exactly as written that day. **UNVERIFIED** marks anything not confirmed from a primary source. Sentences that begin "Recommendation" or "Design" are this document's judgement, not sourced fact.

**User decisions already taken (2026-10-28)** and folded in below: (1) keys are "remembered, encrypted": stored on the device, encrypted with a user passphrase through WebCrypto; (2) invites are one-time links the admin creates in the app, with no email dependency; (3) sign-in is email + password; (4) libraries are private per user (RLS + private storage).

---

## Summary of decision-relevant findings

1. **Vercel Hobby runs Hono with zero config, but not the app as it is today.** A file such as `src/index.ts` that `export default app` becomes a Vercel Function on Fluid compute ([Hono on Vercel](https://vercel.com/docs/frameworks/backend/hono), updated 2026-08-10). Hono's `serveStatic()` "will be ignored". Hobby limits: "300s default and maximum" duration, "2 GB / 1 vCPU", and **"4.5 MB" for the request body *or the response body*** ([limits](https://vercel.com/docs/functions/limitations), updated 2026-08-24). Monthly allotment: "First 1,000,000" invocations, "4 hours" Active CPU, "360 GB-hrs" provisioned memory, "First 100 GB" Fast Data Transfer ([fair use](https://vercel.com/docs/limits/fair-use-guidelines), updated 2026-09-14). Hobby is "restricted to non-commercial personal use only". The in-process `JobRunner`, the 60 s batch poller and SSE cannot survive. **EPUB export downloads larger than 4.5 MB must go through Supabase Storage signed URLs**, not the function response.
2. **One origin for the SPA and `/api` is possible with Vercel Services** ("available in Beta on all plans"). A top-level rewrite sends `/api/(.*)` to the Hono service and `/(.*)` to the Vite service, and "the service receives the original request path" ([Services](https://vercel.com/docs/services), [routing](https://vercel.com/docs/services/routing)).
3. **Vercel runtime logs do not list request headers.** They capture `console.*` output ("256 lines per request", "256 KB per line", "1 MB per request"). The per-request details are method, path, status, host, **User Agent**, **Search Params**, region, and Outgoing Requests (sub-requests). Hobby retention is "1 hour of logs" ([runtime logs](https://vercel.com/docs/logs/runtime), updated 2026-08-28). Drains are Pro/Enterprise only ([drains](https://vercel.com/docs/drains)). **Query strings are logged, so a key or token must never be in a URL.** Whether Vercel keeps request headers anywhere internally is **UNVERIFIED**.
4. **Vercel Workflows/Queues conflict with BYOK.** "Every step, input, output, sleep, and error inside a workflow is recorded automatically", and team owners "can read decrypted Workflow run data" ([Workflows](https://vercel.com/docs/workflows)). A key passed to a step would be persisted server-side. Supabase Edge Functions or pg_cron have the same problem, since they would need a stored key. **Recommendation: client-driven execution.** The browser drives each unit of work, holding the key, and the database holds only progress, so a job resumes whenever the user returns.
5. **Recommendation, the core security choice: the browser calls the LLM providers directly, and our API never sees the key.** `packages/core` and `packages/providers` contain no `node:` imports (grep, 2026-10-28), so the prompt builder, settling logic and SDK adapters can run in the SPA. Anthropic supports this through `dangerouslyAllowBrowser`, which adds the `anthropic-dangerous-direct-browser-access: true` header (SDK 1.2.0 `client.js:970`; [TS SDK docs](https://platform.claude.com/docs/en/cli-sdks-libraries/sdks/typescript)). OpenAI's SDK has the same flag (`openai@7.43.0` `client.js:236`). CORS on the OpenAI and Gemini endpoints is **UNVERIFIED** and must be tested in Phase 0. **Fallback:** a proxy "step" endpoint that receives the key in an `X-Provider-Key` header over TLS, uses it once, and never logs or persists it. The provider warnings against browser keys ([Gemini](https://ai.google.dev/gemini-api/docs/api-key), [OpenAI](https://help.openai.com/en/articles/5112595-best-practices-for-api-key-safety), Anthropic) target *a developer's* key shipped to strangers. With BYOK the key is the user's own and sits in their own browser either way, so direct calls add no browser exposure and remove all server exposure.
6. **Key at rest in the browser:** an AES-GCM-256 envelope whose key is derived from the passphrase with **PBKDF2-HMAC-SHA256 at 600,000 iterations** ([OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)), with a random 16-byte salt and a 96-bit IV that is never reused. WebCrypto `deriveKey` supports PBKDF2 and HKDF only ([MDN deriveKey](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveKey)). Argon2 in WebCrypto is only an "unofficial proposal" ([WICG modern algos](https://wicg.github.io/webcrypto-modern-algos/)). Argon2id is available through WebAssembly (`hash-wasm` 4.12.0, MIT), but needs CSP `'wasm-unsafe-eval'`. While unlocked, the derived key is a **non-extractable `CryptoKey` held in memory**; the plaintext provider key exists only for the duration of a call. **XSS defeats every client-side scheme.** A strict CSP and the existing DOMPurify sanitizer for EPUB HTML are the real defence.
7. **Supabase Free:** "500 MB database size per project", "1 GB file storage", "50 MB" max upload, "5 GB egress", "50,000 monthly active users", Realtime "200" concurrent connections and "2 Million" messages, "Limit of 2 active projects", "1 day" log retention, backups "Not included", and "Free projects are paused after 1 week of inactivity" ([pricing](https://supabase.com/pricing)). A paused project is resumed from the dashboard ("Resume project") and is restorable "for up to 1 year after it was paused" ([pausing](https://supabase.com/docs/guides/platform/free-project-pausing)). Whether an API request wakes it is not stated, so assume it does not.
8. **Egress is the tightest Supabase quota.** Today `renderChapter` and the asset routes read the whole EPUB blob each time (`BlobStore.get`). From Storage, each chapter view would cost the EPUB's size in egress, so 5 GB ÷ 5 MB ≈ 1,000 views a month across all users. Design: cache EPUB bytes in the warm Fluid instance, and/or extract chapter XHTML and assets into Postgres/Storage at import time, so a view reads kilobytes.
9. **Built-in Supabase email is unusable for invitees.** It "will refuse to deliver messages to addresses that are not part of the project's team" and is capped at "2 messages per hour" ([SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [rate limits](https://supabase.com/docs/guides/auth/rate-limits)). Custom SMTP defaults to "30 messages per hour". This confirms the decision: **invite links and password-reset links are generated in-app and handed over by the admin; no email is ever sent.**
10. **Invites: an own invite-token table plus `auth.admin.createUser` on accept beats `generateLink({type:'invite'})`.** In GoTrue, `generateLink` invite **creates the user row at link-creation time** and returns `action_link`, `email_otp`, `hashed_token`, `verification_type` and `redirect_to` (`internal/api/mail.go:126-175, 308-315`). Its expiry is the mailer OTP expiry (self-host default `86400` s, `conf/configuration.go:1229`; hosted default **UNVERIFIED**). The invitee must then verify and call `updateUser({password})`. `DisableSignup` is checked only in `signup.go:115`, not on the admin `/invite`, `/admin/generate_link` or `/admin/users` routes, so both approaches work with "Allow new users to sign up" off. The own table gives single-use tokens bound to an email with configurable expiry and revocation, and sets the password in one step.
11. **Server-side auth:** verify the Supabase access token against the project JWKS (`/auth/v1/.well-known/jwks.json`; edge-cached "10 minutes", client libraries may cache "an additional 10 minutes") with asymmetric ES256 keys ([signing keys](https://supabase.com/docs/guides/auth/signing-keys)), using `jose` or `getClaims()` ([getClaims](https://supabase.com/docs/reference/javascript/auth-getclaims)). Check `aud = "authenticated"` ([claims](https://supabase.com/docs/guides/auth/jwt-fields)) and `iss`. Access tokens default to "1 hour" ([sessions](https://supabase.com/docs/guides/auth/sessions)) and stay usable after sign-out until expiry, so revocation needs a per-request `app_users.disabled` check.
12. **Postgres from Vercel:** use the shared pooler in transaction mode on port 6543 ("Use it for serverless and edge functions"). It "doesn't support prepared statements in transaction mode" and is "IPv4-only on every plan" (direct connections are IPv6-only). Supabase's Vercel guidance is: client at module scope, pool size 1, prepared statements off, SSL `require` ([connecting](https://supabase.com/docs/guides/database/connecting-to-postgres)). Connecting as `postgres` bypasses RLS. Design: run each request in a transaction with `set local role authenticated` and `set_config('request.jwt.claims', …, true)`. `auth.uid()` reads exactly that setting (`supabase/auth` migration `20220224000811_update_auth_functions.up.sql`), so RLS applies as defence in depth beneath explicit `owner_id` predicates.

---

## 1. Recommended architecture

**One Vercel Hobby project, one Supabase Free project, one origin.** Vercel Services serves the Vite SPA at `/` and the Hono API at `/api/*`. Supabase Auth (email + password, sign-ups disabled) issues the JWTs. The Hono API verifies them and talks to Supabase Postgres through the transaction pooler, with RLS enforced per request. EPUBs live in a private Storage bucket under `<user_id>/…`. Uploads go browser → Storage through server-minted signed upload URLs; exports go Storage → browser through short-lived signed download URLs. Both bypass the 4.5 MB function body limit. **LLM keys never leave the browser except to the provider.** The SPA keeps each key AES-GCM-encrypted under a passphrase, unlocks it into memory, and calls Anthropic, OpenAI or Gemini directly using the existing `@et/core` and `@et/providers` code. It fetches work units from our API (`GET …/work`) and posts results back (`POST …/results`). The database holds job progress and vendor batch ids, never keys. Translation advances only while a tab is open, and resumes from the database whenever the user returns. Local mode keeps the current composition: SQLite, filesystem blobs, env keys, the in-process runner and SSE.

- **Hosting:** Vercel Hobby, Services (beta): `web` (Vite static) + `api` (Hono, Node.js runtime, Fluid). Standard Deployment Protection on, so preview URLs are not public.
- **Auth:** Supabase Auth email + password; "Allow new users to sign up" **off**; users are created only by our invite-accept endpoint through `auth.admin.createUser({ email, password, email_confirm: true })`.
- **Admin:** `ADMIN_EMAILS` env (server-side) bootstraps the admin; the admin UI creates and revokes invite links, disables users, and generates password-reset links.
- **Data:** a new `packages/store-postgres` (postgres.js, `prepare: false`, `max: 1`) mirroring the SQLite schema plus `owner_id uuid` on every table, RLS `to authenticated using ((select auth.uid()) = owner_id)`.
- **Blobs:** `SupabaseBlobStore` (Storage API, secret key, server-only) behind the existing `BlobStore` port; private buckets `books` and `exports`.
- **Execution:** client-driven work units. Live mode: one provider call per unit, run in the browser. Batch mode: the browser submits and later polls the vendor batch with the key, and the server stores `vendor_batch_id` only.
- **Keys:** per-provider, encrypted in IndexedDB, unlocked per tab into a non-extractable in-memory `CryptoKey`; never in URLs, never in our requests (direct mode), never logged.
- **Progress UI:** derived client-side from the work loop plus `GET /api/jobs/:id` polling; no SSE, no Realtime.

---

## 2. Vercel (Hobby)

### 2.1 Facts

| Topic | Exact finding | Source |
|---|---|---|
| Hono zero-config | Entrypoint at `app.*`, `index.*`, `server.*` or `src/{app,index,server}.*` that imports `hono` and `export default app`; routes "automatically become Vercel Functions and use Fluid compute by default" | [Hono on Vercel](https://vercel.com/docs/frameworks/backend/hono) |
| Static files | "place them in the `public/**` directory"; "Hono's `serveStatic()` will be ignored" | same |
| Frontend + backend in one project | "Use Vercel Services"; Services "available in Beta on all plans"; `vercel.json` `services` + top-level `rewrites` with `destination: { service }`; build fields (`buildCommand`, `outputDirectory`, `framework`, …) move into each service | [Services](https://vercel.com/docs/services) (2026-08-10) |
| Path seen by the API | "The service receives the original request path. `GET /api/users` reaches `my_backend` as `/api/users`" | [Services routing](https://vercel.com/docs/services/routing) |
| Monorepo | Root Directory = app location; build `turbo run build` or `cd ../.. && turbo run build --filter=web`; install auto-detected | [Turborepo on Vercel](https://vercel.com/docs/monorepos/turborepo) |
| Duration | Hobby "300s (5 minutes)" default and max; timeout returns 504 `FUNCTION_INVOCATION_TIMEOUT`; the limit includes "streamed responses" | [limits](https://vercel.com/docs/functions/limitations) |
| Memory/CPU | Hobby "2 GB / 1 vCPU" default and max | same |
| Body | "maximum payload size for the request body or the response body … is **4.5 MB**" → 413 `FUNCTION_PAYLOAD_TOO_LARGE` | same |
| File descriptors | "1,024 shared across concurrent executions" | same |
| Monthly Hobby allotment | Fast Data Transfer "First 100 GB"; Function Invocations "First 1,000,000"; Fast Origin Transfer "First 10 GB"; Active CPU "4 hours"; Provisioned Memory "360 GB-hrs" | [fair use](https://vercel.com/docs/limits/fair-use-guidelines) |
| Active CPU | "Waiting for I/O (e.g. calling AI models, database queries) does not count towards active CPU time"; provisioned memory = memory × instance running time | [limits](https://vercel.com/docs/functions/limitations) |
| Commercial use | Hobby "restricted to non-commercial personal use only" | [fair use](https://vercel.com/docs/limits/fair-use-guidelines) |
| Fluid concurrency | "multiple invocations can share the same physical instance (a global state/process) concurrently"; default for new projects since 2025-04-23 | [Fluid compute](https://vercel.com/docs/fluid-compute) |
| Runtime log content | `console.log` → info, `console.error` → error; details include Request Method, Path, Status, Host, Request User Agent, **Search Params**, Region, Function metadata, **Outgoing Requests**, Log Messages | [runtime logs](https://vercel.com/docs/logs/runtime) |
| Log limits / retention | 256 lines/request, 256 KB/line, 1 MB/request; Hobby "1 hour of logs" | same |
| Drains | "available on Enterprise and Pro plans" | [drains](https://vercel.com/docs/drains) |
| Env vars | Types **Config** (readable) and **Secret** ("write-only after saving"); build logs redact Secret values ≥ 32 chars | [Config and Secret env vars](https://vercel.com/docs/environment-variables/sensitive-environment-variables) |
| Deployment Protection | Vercel Authentication "Restricts access to only Vercel users with suitable access rights"; Standard Protection (all but production) and All Deployments are "available on all plans"; Password Protection "Not available on Hobby" | [Deployment Protection](https://vercel.com/docs/deployment-protection) (2026-09-15) |
| Workflows | Inputs, outputs and errors "recorded automatically"; owners can read "decrypted Workflow run data" | [Workflows](https://vercel.com/docs/workflows) |

### 2.2 Reading for this app

- **Vercel Authentication is not a multi-user gate.** It admits only Vercel accounts with access to the team, and a Hobby team has one member. Recommendation: use **Standard Protection** so preview deployments, which carry the production Supabase secrets, are not public. The production domain stays open, and app auth guards it.
- **Global state is shared across users** on a Fluid instance. Never keep per-user secrets in module scope. Caches such as an EPUB-bytes LRU must be keyed by `owner_id`, and must never serve one user's data to another.
- **better-sqlite3 must not be bundled** into the Vercel function. Design: a Vercel-specific composition root (`apps/api/src/vercel.ts` or `index.ts`) that imports `store-postgres` only. The local `main.ts` keeps `store-sqlite`.
- **4.5 MB response cap:** `GET /api/jobs/:id/export` (EPUB) and large covers or assets may exceed it. Exports are written to Storage and returned as a signed URL. Image assets of 4.5 MB or more are rare (**UNVERIFIED** for real books); if one appears, use a signed-URL redirect.
- **Provisioned memory** counts waiting time. 360 GB-hrs at 2 GB is about 180 instance-hours a month, shared by concurrent requests on Fluid. In direct-browser mode the function never waits on LLM calls, so this stops being a concern. In proxy mode it is the binding limit. Whether Hobby can set function memory below 2 GB is **UNVERIFIED** (the docs say Pro/Enterprise "can configure the default memory size").
- **SPA deep-link fallback** for the Vite service (`/books/:id` → `index.html`) under Services is **UNVERIFIED**. Phase 0 must test it, or add a service-level rewrite.

---

## 3. Supabase (Free)

### 3.1 Limits

| Resource | Free (exact) | Implication |
|---|---|---|
| Database | "500 MB database size per project" | Text only; fine for dozens of books with translations. Keep `parsed_json` compact. |
| Storage | "1 GB file storage"; global upload limit "can't exceed 50 MB" ([file limits](https://supabase.com/docs/guides/storage/uploads/file-limits)) | Roughly 200–300 EPUBs in total; the current `MAX_UPLOAD_BYTES` of 200 MB drops to 50 MB. Delete exports after a TTL. |
| Egress | "5 GB egress", "5 GB cached egress" | Never re-download the full EPUB per chapter view (§1 finding 8). |
| Auth | "50,000 monthly active users" | Not a constraint. |
| Realtime | "200" concurrent, "2 Million" messages/month; 100 msgs/s, 100 joins/s, broadcast 256 KB ([Realtime limits](https://supabase.com/docs/guides/realtime/limits)) | Not needed: progress is client-driven. |
| Projects | "Limit of 2 active projects" | One for production; optionally one for staging. |
| Logs / backups | "1 day"; backups "Not included" | Design: a scheduled `pg_dump` from the Mac or CI. |
| Pausing | "paused after 1 week of inactivity" ("sufficient user database activity"); warning email "roughly one week before"; "Resume project" in the dashboard; restorable "for up to 1 year" | Normal use keeps it awake. Pinging it to dodge pausing is against the spirit of the terms (Recommendation: don't). |

### 3.2 Auth

| Topic | Finding | Source |
|---|---|---|
| Disable sign-ups | "If this config is disabled, only existing users can sign in" | [general config](https://supabase.com/docs/guides/auth/general-configuration) |
| Do admin routes bypass it? | Yes: `DisableSignup` appears only in `signup.go:115`; `/invite`, `/admin/generate_link` and `/admin/users` sit behind `requireAdminCredentials` (`api.go:228, 359-394`) and do not check it | `supabase/auth` source |
| `generateLink` invite | Creates the user if absent (`mail.go:126-175`); a confirmed existing email → 422 `email_exists`; response `{ action_link, email_otp, hashed_token, verification_type, redirect_to, user }` (`mail.go:308-315`); "Generates email links and OTPs to be sent via a custom email provider" | source; [reference](https://supabase.com/docs/reference/javascript/auth-admin-generatelink) |
| `createUser` | "should only be called on a server. Never expose your `service_role` key"; `email_confirm`, `ban_duration` params (`admin.go:30-34, 222, 255`) | [reference](https://supabase.com/docs/reference/javascript/auth-admin-createuser); source |
| Email | Built-in: team-only recipients, "2 messages per hour", "not meant for production use"; custom SMTP default "30 messages per hour" | [SMTP](https://supabase.com/docs/guides/auth/auth-smtp) |
| Auth rate limits | Sign-ups/sign-ins "30 requests per 5 minutes" per IP; token endpoint "150 requests per 5 minutes" (covers refresh) | [rate limits](https://supabase.com/docs/guides/auth/rate-limits) |
| Sessions | JWT expiry default "1 hour", not below "5 minutes"; refresh tokens "never expire but can only be used once"; time-box and inactivity timeout are "only available on Pro Plans and up" | [sessions](https://supabase.com/docs/guides/auth/sessions) |
| Claims | Always present: `iss`, `aud` (`"authenticated"`), `exp`, `iat`, `sub`, `role`, `aal`, `session_id`, `email`, `phone`, `is_anonymous` | [JWT fields](https://supabase.com/docs/guides/auth/jwt-fields) |
| Keys | Asymmetric ES256 recommended; legacy HS256 "Not recommended for production"; new `sb_publishable_…` / `sb_secret_…` API keys "no longer are based on the JWT signing key" | [signing keys](https://supabase.com/docs/guides/auth/signing-keys) |
| Verify on server | `jose` `createRemoteJWKSet` + `jwtVerify` against the JWKS; or `getClaims()` (verifies locally with asymmetric keys, otherwise "always sends a request to the Auth server") | [JWTs](https://supabase.com/docs/guides/auth/jwts), [getClaims](https://supabase.com/docs/reference/javascript/auth-getclaims) |
| Is the new-project default asymmetric? | Not stated | **UNVERIFIED**; Phase 0 checks it in the dashboard |

### 3.3 RLS, Storage, Postgres

| Topic | Finding | Source |
|---|---|---|
| RLS basics | "Enable RLS on every table in an exposed schema"; `auth.uid()` is `null` for anonymous requests; wrap it as `(select auth.uid())` for an initPlan; "Add an index on every column your policies filter on"; always name the role (`to authenticated`); `service_role` "has the `bypassrls` attribute"; do not authorize on `user_metadata` | [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) |
| `auth.uid()` mechanism | Reads `current_setting('request.jwt.claim.sub')` or `request.jwt.claims ->> 'sub'` | `supabase/auth` migration `20220224000811` |
| Private buckets | "all operations are subject to access control via RLS policies"; new buckets are private by default; access by user-JWT requests or `createSignedUrl` | [buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals) |
| Storage RLS | Policies on `storage.objects`; folder rule `(storage.foldername(name))[1] = (select auth.jwt()->>'sub')`; upload = INSERT; upsert additionally SELECT + UPDATE; "Service keys entirely bypass RLS" | [access control](https://supabase.com/docs/guides/storage/security/access-control) |
| Signed upload | `createSignedUploadUrl` URLs "are valid for 2 hours" and allow upload "without further authentication"; `uploadToSignedUrl(path, token, fileBody)`; upsert must be set on create | [create](https://supabase.com/docs/reference/javascript/storage-from-createsigneduploadurl), [upload](https://supabase.com/docs/reference/javascript/storage-from-uploadtosignedurl) |
| Signed download | `createSignedUrl(path, expiresIn /* seconds */, { download })` | [createSignedUrl](https://supabase.com/docs/reference/javascript/storage-from-createsignedurl) |
| Upload method | TUS resumable recommended for files "greater than 6MB" | [standard uploads](https://supabase.com/docs/guides/storage/uploads/standard-uploads) |
| Pooler | Transaction mode port 6543 for serverless; no prepared statements; IPv4-only; module-scope client, pool size 1, SSL require | [connecting](https://supabase.com/docs/guides/database/connecting-to-postgres) |

Design for DB access: postgres.js (`postgres(url, { prepare: false, max: 1, ssl: 'require' })`). Every request runs `sql.begin(async tx => { await tx\`select set_config('role','authenticated',true), set_config('request.jwt.claims', ${claimsJson}, true)\`; … })`. Transaction-local settings are the only safe kind behind a transaction pooler; session-level `SET` could leak to another client (inference from transaction pooling semantics; **UNVERIFIED** as a Supabase-documented pattern). Every repository query also carries `where owner_id = $uid`. Alternative: supabase-js Data API with the user's JWT, which enforces RLS natively but gives no multi-statement transactions and an HTTP round-trip per query. Rejected for the repository layer.

---

## 4. BYOK key handling

### 4.1 Where the provider call runs

| Option | Key exposure | Pros | Cons |
|---|---|---|---|
| **A. Browser → provider directly** (recommended) | Browser memory and the provider only | Key never touches Vercel or Supabase, so there is nothing to redact. No 300 s or Active-CPU pressure. Batch submit and poll use the same code. | CORS for OpenAI and Gemini **UNVERIFIED**. Translation logic ships in the SPA bundle (`@et/core`, `@et/providers` and three SDKs; bundle size **UNVERIFIED**). Results are client-asserted (acceptable: it is the user's own data). CSP `connect-src` must list the provider origins. |
| B. Browser → our function → provider (fallback) | Browser, TLS to Vercel, function memory | Reuses the server-side flow as is; works if a provider lacks CORS | Key transits our infrastructure, so redaction discipline is required (§4.3). Each step is limited to under 300 s. Waiting time counts toward provisioned memory. |
| C. Key stored server-side (Workflows/Queues/pg_cron/Edge Functions) | DB or workflow event log | Runs without an open tab | **Violates requirement 3**; rejected |

SDK facts for options A and B:
- **Anthropic SDK 1.2.0:** `dangerouslyAllowBrowser` adds the `anthropic-dangerous-direct-browser-access` header (`client.js:970`). `maxRetries` defaults to 2, `logLevel` defaults to `ANTHROPIC_LOG` or `'warn'`, and `logger` defaults to `globalThis.console`. At `'debug'` "all HTTP requests and responses are logged, including headers and bodies. Some authentication-related headers are redacted" ([TS SDK](https://platform.claude.com/docs/en/cli-sdks-libraries/sdks/typescript)). The source redacts `authorization`, `proxy-authorization` and `x-api-key` (`internal/utils/log.js:105-108`). An `openTelemetry: false` option disables spans (`client.d.ts:176`). The default timeout is 10 minutes.
- **OpenAI SDK 7.43.0:** `dangerouslyAllowBrowser` (`client.js:236`), `logLevel` (`OPENAI_LOG`), `maxRetries` default 2, and a log sanitizer for sensitive keys (`client.js:1504-1530`).
- **@google/genai 2.31.0:** the API key travels in the `x-goog-api-key` header (`dist/node/index.mjs:25853`), not a query string (except a Live-music websocket the app doesn't use). The Gemini docs say "Never expose keys client-side in production" and "The Gemini API rejects requests from unrestricted standard keys" ([API key](https://ai.google.dev/gemini-api/docs/api-key)). The second point means users must restrict their key to the Gemini API in AI Studio, so the key-entry UI should tell them.
- **OpenAI error text echoing a masked key** ("Incorrect API key provided: sk-…xxxx") is **UNVERIFIED**: the [error-codes guide](https://developers.openai.com/api/docs/guides/error-codes) does not show the message body. Treat every provider error message as potentially key-bearing.

### 4.2 Key at rest and in use (user decision: remember, encrypted)

| Concern | Choice | Source / note |
|---|---|---|
| KDF | PBKDF2-HMAC-SHA256, **600,000** iterations, 16-byte random salt per envelope. Argon2id (OWASP `m=19456, t=2, p=1`) through `hash-wasm` as an optional v2. | [OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html); WebCrypto offers only PBKDF2/HKDF ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveKey)); Argon2 in WebCrypto is a WICG "unofficial proposal"; `hash-wasm` 4.12.0 lists "Argon2d, Argon2i, Argon2id (v1.3)" ([README](https://github.com/Daninet/hash-wasm)) |
| Cipher | AES-GCM-256, 96-bit random IV per encryption, never reused, 128-bit tag (default), `additionalData` = `"et-key-v1:" + provider + ":" + supabaseUserId`, which binds the ciphertext to its slot and user | [AesGcmParams](https://developer.mozilla.org/en-US/docs/Web/API/AesGcmParams): "never reuse an IV with the same key", "recommends that the IV should be 96 bits", tagLength "defaults to 128" |
| Derived key | `deriveKey(…, extractable: false, ['encrypt','decrypt'])` | [CryptoKey.extractable](https://developer.mozilla.org/en-US/docs/Web/API/CryptoKey) |
| Envelope storage | IndexedDB record `{ v:1, kdf:'pbkdf2-sha256', iter, salt, iv, ct, provider, last4, createdAt }`, scoped per Supabase user id; `last4` is shown in the UI | `CryptoKey` objects "are serializable objects" ([WebCrypto §13.5](https://w3c.github.io/webcrypto/)) |
| Unlocked state | **Memory only**: a module-scoped non-extractable `CryptoKey`. Decrypt the provider key just before each provider call, and drop the reference afterwards. Locks on reload, sign-out, user switch, or an idle timer (for example 30 min). | Design. sessionStorage holds strings only, so the key would sit there as plaintext; OWASP: "A single Cross Site Scripting can be used to steal all the data in these objects" ([HTML5 cheat sheet](https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html)) |
| Optional "stay unlocked on this device" | Store the non-extractable derived `CryptoKey` in IndexedDB with an `unlockedUntil` timestamp | Design: no worse than memory against XSS (an attacker in the page can call `decrypt` either way); worse against device theft. Off by default. |
| Passphrase | Never sent anywhere; distinct from the Supabase password; no recovery (forgotten → delete the envelope and re-enter the key) | Design |
| Sign-out | Wipe the in-memory key; envelopes stay (encrypted). "Forget keys on this device" deletes them. | Design |

### 4.3 Hygiene rules (both options; mandatory for option B)

- **Never in URLs:** Vercel logs Search Params, and URLs leak through `Referer`. Keys, invite tokens and reset tokens go in headers or bodies; invite links put the token in the **URL fragment** (`#t=…`), which browsers never send to servers.
- **Header (option B):** `X-Provider-Key`, sent only on `POST /api/jobs/:id/step` and `POST …/glossary/suggest`, same-origin over HTTPS. Add `Cache-Control: no-store` to those responses.
- **Server construction (option B):** build a new client per request, never cached or in module scope (Fluid shares the instance). Use `new Anthropic({ apiKey, maxRetries: 0, logLevel: 'off', openTelemetry: false })`, `new OpenAI({ apiKey, maxRetries: 0, logLevel: 'off' })` and `new GoogleGenAI({ apiKey })`. Do not set `ANTHROPIC_LOG`/`OPENAI_LOG` in Vercel env.
- **Redaction:** wrap provider error messages before they reach `jobs.error` (persisted!), JSON responses or `console.*`:
  - replace the exact key string;
  - replace the patterns `sk-ant-[\w-]+`, `sk-(proj-)?[\w-]{8,}` and `AIza[\w-]{30,}`;
  - keep the existing generic message for 401/403 (`providers/src/errors.ts`).

  `handleError` already returns "Internal server error" for 500s and logs only `err.name`. Keep that, and add a test that a thrown error containing a fake key never appears in a response or in the persisted `error` column.
- **No request logging middleware** (no `hono/logger`) on routes that carry keys; no Vercel Analytics or third-party scripts on pages where keys are entered.
- **CSRF/CORS:** API auth is a `Authorization: Bearer <supabase JWT>` header (not a cookie) for all mutating routes, so cross-site forms cannot ride it. No CORS headers, since everything is same-origin. Image and asset GETs need a credential that `<img>` can carry (§7, Phase 3).
- **CSP** (set in `vercel.json` headers for the web service):
  - `default-src 'self'`
  - `script-src 'self'` (add `'wasm-unsafe-eval'` only if Argon2id is adopted)
  - `connect-src 'self' https://<ref>.supabase.co https://api.anthropic.com https://api.openai.com https://generativelanguage.googleapis.com`
  - `img-src 'self' blob: data:`
  - `frame-ancestors 'none'`
  - `object-src 'none'`
  - `base-uri 'none'`

  Keep DOMPurify on EPUB HTML (`apps/web/src/lib/sanitize.ts` already forbids `script`, `iframe`, `style`, `form` and non-`/api/` URLs). **A malicious EPUB is the most realistic XSS vector against stored keys.**

### 4.4 Threat model for API keys

| Vector | Mitigation |
|---|---|
| Our DB / Supabase compromise | Keys never stored server-side; DB has only `vendor_batch_id`s |
| Vercel runtime logs / Observability | Direct mode: the key never reaches Vercel. Proxy mode: no key in URLs (Search Params are logged), no logging middleware, SDK `logLevel:'off'`, redacted errors. Hobby retention is 1 h. |
| Vercel Workflows/Queues event logs | Not used (they persist step inputs) |
| Error messages echoing keys (provider → our API → UI/DB) | Redact the exact key and known patterns before persisting or returning; generic 401/403 text |
| SDK debug logging / OTel spans | `logLevel:'off'`, `openTelemetry:false`; no `*_LOG` env vars |
| Fluid shared-instance leakage | Per-request client; no module-scope key; no per-user caches without `owner_id` keys |
| URL / Referer / browser history leakage | Keys only in headers or memory; invite and reset tokens in the URL fragment |
| XSS in the SPA (incl. malicious EPUB HTML) | DOMPurify + strict CSP + no third-party scripts + React escaping. Residual: XSS can use an unlocked key. Short idle lock limits the window. |
| Stolen device / IndexedDB dump | AES-GCM with a PBKDF2-600k passphrase; memory-only unlock by default |
| Malicious browser extension | Out of scope (it can read the page); document it |
| Network interception | HTTPS only (Vercel TLS); HSTS via `secureHeaders` |
| Another tenant reading my key | Keys never leave my browser; envelopes are scoped by user id |
| CSRF using my session to spend my key | The key is not sent automatically by the browser; bearer JWT; same-origin |
| Third-party analytics/APM | None on the key page; Vercel Web Analytics off |

---

## 5. Job execution without long-lived processes

- **Rejected:** Vercel Workflows and Queues (step inputs are persisted, so the key would be stored); Vercel Daemons (would need a stored key; not researched further); Supabase Edge Functions or pg_cron (same); Fluid `waitUntil` (still bounded by the 300 s request, and the key would outlive the request in memory).
- **Recommended work-unit protocol, option A:**
  1. `POST /api/jobs/:id/chapters/:chapterId/lease` returns the next pending segment batch: ids, source text, context, glossary, instructions, model, and a lease id with `leased_until = now() + 10 min`. The batch is chosen with `batchSegments` (the same `maxChars`/`maxCount` as the runner), and `FOR UPDATE SKIP LOCKED` keeps two tabs from taking the same batch.
  2. The browser calls `translateSegments` via `@et/providers`, with the key from memory.
  3. `POST …/results { leaseId, segments, usage, outcome }`. The server validates ids and placeholders with core `settle`, upserts `translations` (PK `(job_id, segment_id)` makes it idempotent), adds usage, and clears the lease.
  4. Loop until the chapter is done, then the next chapter (and "translate all").
- **Concurrency** is a client setting (default 2 in flight). Retry and backoff live in the client (the same retryable/fatal mapping).
- **Option B variant:** `POST …/step` with `X-Provider-Key` does lease, call and settle in one request. Use a provider timeout of `≤ 240 s` (under the 300 s max) and smaller batches.
- **Resumability:** all state is in Postgres (pending = segments without a `done` translation). Closing the tab pauses; leases expire and are re-issued; reopening the book resumes.
- **Vendor batch mode:**
  - The browser builds requests (core), submits with the key, and `POST …/batches` records `{ vendor_batch_id, provider, model, segment_ids, status }`. These are today's `provider_batches` columns, with no key.
  - Polling is client-driven: on book open, on a "Check batch" button, and every N minutes while the tab is open. It calls the vendor with the key, then posts results the same way.
  - The user must come back before the vendor's retention window ends. Anthropic, OpenAI and Gemini batch result retention: **UNVERIFIED**; show the vendor's created date in the UI.
- **Progress:** the client knows its own loop. Other tabs or devices poll `GET /api/jobs/:id` (cheap, a few invocations a minute). SSE and Realtime are not needed, which avoids the `EventSource`-cannot-send-headers problem noted in the 2026-10-24 doc.

---

## 6. Invite-only UX (user decisions: invite link, email + password)

| Step | Design | Basis |
|---|---|---|
| Bootstrap | `ADMIN_EMAILS` (Vercel Secret). The first admin is created once, either in the Supabase dashboard (Authentication → Add user, auto-confirm) or by a one-off `pnpm admin:create` script using the secret key. Admin = JWT `email` ∈ `ADMIN_EMAILS` **and** `app_users.role = 'admin'`. | Avoids trusting `user_metadata` ([RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)) |
| Create invite | Admin UI → `POST /api/admin/invites { email?, expiresInHours (default 72) }`. The server generates 32 random bytes, stores **`sha256(token)`**, and returns `https://<app>/invite#t=<base64url>` once. The admin copies it and sends it by any channel. | Design; no email dependency (built-in SMTP is team-only, 2/h) |
| Accept | `/invite` page reads the fragment → form (email prefilled or locked if bound, password ×2) → `POST /api/invites/accept { token, email, password }`. Atomic `update invites set used_at=now(), used_by=… where token_hash=$1 and used_at is null and expires_at>now() and (email is null or email=$2) returning id`, then `auth.admin.createUser({ email, password, email_confirm: true })`, then insert `app_users`. If `createUser` fails, roll back `used_at`. The client then calls `supabase.auth.signInWithPassword`. | `createUser`, `email_confirm` ([ref](https://supabase.com/docs/reference/javascript/auth-admin-createuser), `admin.go`); admin routes are not blocked by disabled sign-ups (`signup.go:115` only) |
| Why not `generateLink({type:'invite'})` | It creates an unconfirmed user at link creation, ties expiry to the global email OTP setting, needs a verify redirect plus a separate `updateUser({password})`, and cannot bind or revoke without deleting the user | `mail.go:126-175, 308-315` |
| Sign-in | `signInWithPassword` in the SPA (supabase-js, publishable key). Sign-ups off. Password minimum length and leaked-password protection settings: **UNVERIFIED** per plan. | [general config](https://supabase.com/docs/guides/auth/general-configuration) |
| Password reset | Self-service email is not possible on built-in SMTP. The admin clicks "Reset link" → `auth.admin.generateLink({ type: 'recovery', email })` → shows `action_link` to hand over (or builds an in-app link from `hashed_token` + `verifyOtp`). Optional custom SMTP later (30/h default). | `mail.go` recovery branch; [SMTP](https://supabase.com/docs/guides/auth/auth-smtp) |
| Revoke | Admin "Disable" sets `app_users.disabled = true` (checked by the API middleware on every request, effective immediately) **and** `auth.admin.updateUserById(id, { ban_duration: '876000h' })` to stop new sessions and refreshes. "Delete" calls `deleteUser` and purges `<uid>/` storage and rows (FK cascade). | `ban_duration` in `admin.go:34, 222-227, 377`; 1 h access-token lifetime ([sessions](https://supabase.com/docs/guides/auth/sessions)) |
| Invite list | Show pending, used and expired; revoke = delete the row | Design |
| Rate limits | Auth sign-in "30 requests per 5 minutes" per IP; add a per-IP limit on `/api/invites/accept` (in Postgres; Vercel has no shared memory) | [rate limits](https://supabase.com/docs/guides/auth/rate-limits) |

---

## 7. Data model (Postgres) and storage layout

Mirrors `packages/store-sqlite/src/migrations.ts`, adds `owner_id`, and ships as SQL migrations in `packages/store-postgres/migrations/`.

| Table | Columns (new in **bold**) | Keys / indexes | RLS (`to authenticated`) |
|---|---|---|---|
| **`app_users`** | **`id uuid pk references auth.users on delete cascade`, `role text check in ('admin','user')`, `disabled bool default false`, `created_at`** | — | select own row; writes by server only |
| **`invites`** | **`id`, `token_hash text unique`, `email citext null`, `created_by uuid`, `expires_at`, `used_at`, `used_by`** | `token_hash` | none for `authenticated` (server-side admin only) |
| `books` | `id`, **`owner_id uuid not null`**, `sha256`, `title`, `author`, `source_lang`, `cover_href`, `created_at`, `parsed_json jsonb`, **`blob_key text`** | **`unique(owner_id, sha256)`** (per-user dedupe; the global `unique(sha256)` is dropped), `index(owner_id)` | `(select auth.uid()) = owner_id` for all ops |
| `book_settings` | `book_id pk → books on delete cascade`, **`owner_id`**, `json jsonb` (prompt, glossary, provider, model) | `index(owner_id)` | same |
| `jobs` | `id`, `book_id → books cascade`, **`owner_id`**, `target_lang`, `source_lang`, `error`, `input_tokens`, `output_tokens`, `created_at` | `unique(book_id, target_lang)`, `index(owner_id)` | same |
| `translations` | `job_id → jobs cascade`, `segment_id`, **`owner_id`**, `text`, `status`, `note` | `pk(job_id, segment_id)`, `index(owner_id)` | same |
| `provider_batches` | `id`, `job_id → jobs cascade`, **`owner_id`**, `chapter_id`, `provider`, `model`, `vendor_batch_id`, `status`, `segment_ids jsonb`, `created_at` | `(status, job_id, chapter_id)`, `index(owner_id)` | same |
| **`work_leases`** | **`job_id`, `chapter_id`, `segment_ids jsonb`, `owner_id`, `leased_until`** | `pk(job_id, chapter_id, …)` | same |
| **`book_chapters`** (optional, egress) | **`book_id`, `chapter_id`, `owner_id`, `xhtml text`** | `pk(book_id, chapter_id)` | same |

- **Denormalised `owner_id`** on child tables keeps policies index-only (no joins in RLS). A trigger or check ensures it equals the parent's `owner_id`.
- **Storage:** private bucket `books` (`file_size_limit` 50 MB, MIME `application/epub+zip`; exact field names **UNVERIFIED**, set in the dashboard): `<uid>/books/<sha256>.epub` and `<uid>/incoming/<uuid>.epub` (deleted after import). Private bucket `exports`: `<uid>/exports/<jobId>-<layout>.epub`, deleted after 24 h by a cleanup on the next request. Policies: select/insert/delete where `(storage.foldername(name))[1] = (select auth.uid()::text)`. The server uses the secret key, so it bypasses these policies, and validates the `<uid>/` prefix itself. The policies protect any direct supabase-js use from the browser.
- **Upload flow:**
  1. `POST /api/uploads` (JWT) → the server calls `createSignedUploadUrl('<uid>/incoming/<uuid>.epub')` and returns `{ path, token }`.
  2. The browser calls `uploadToSignedUrl` (≤ 50 MB; the valid-for-2-hours token).
  3. `POST /api/books/import { path }` → the server downloads, hashes, dedupes on `(owner_id, sha256)`, moves to `books/`, parses, inserts.

  This bypasses the 4.5 MB body limit. TUS is recommended above 6 MB for reliability.
- **Asset and cover `<img>` URLs** cannot carry a bearer header. Design options:
  - (a) the API sets an `HttpOnly; Secure; SameSite=Strict; Path=/api/books` cookie holding the current Supabase access token on sign-in and refresh (`POST /api/session`), accepted only on GET asset, cover and chapter routes;
  - (b) the SPA fetches assets with `Authorization` and swaps in `blob:` URLs (sanitizer and CSP change).

  Recommendation: (a), the smaller change. Never put a token in a query string.
- **Privacy/copyright:** users upload their own books into private buckets; no public URLs are ever created; signed download URLs are short (≤ 300 s) and per-request; cross-user dedupe is deliberately off (each user stores their own copy, so no one learns another user owns a book by hash).

---

## 8. Implementation plan outline (not code)

**Phase 0: spikes (half a day each, throwaway).**
- Vercel Services with `apps/web` (Vite) + `apps/api` (Hono `src/index.ts` default export) from the monorepo root; check deep-link SPA fallback and that `/api/*` keeps its path.
- Check CORS from the browser to `api.openai.com` and `generativelanguage.googleapis.com` with each SDK's browser mode.
- In a fresh Supabase project, confirm asymmetric signing keys, set sign-ups off, and check that `createUser` works with sign-ups off.

**Phase 1: make the ports async and composition pluggable (no behaviour change).**
1. Change `BookRepository`, `BookSettingsRepository`, `JobRepository`, `TranslationRepository` and `BatchRepository` in `packages/core/src/ports/` to return `Promise`s; update use cases and `JobRunner`; wrap the `store-sqlite` methods.
2. Add `OwnerContext` (`ownerId`) to every repository call or construct repositories per request. Local mode uses a constant `LOCAL_OWNER` uuid.
3. Split `apps/api/src/services.ts` into `compose-local.ts` (SQLite, fs, env keys, runner, poller, SSE; today's behaviour) and `compose-vercel.ts` (Postgres, Supabase blobs, no runner). `apps/api/src/index.ts` default-exports the Vercel app; `main.ts` stays for `pnpm dev`.

**Phase 2: `packages/store-postgres`.**
- postgres.js client (`prepare:false`, `max:1`, `ssl:'require'`).
- A `withUser(claims, fn)` transaction helper that sets role and claims.
- Repositories mirroring SQLite with `owner_id`.
- SQL migrations (§7) + RLS + indexes.
- A migration runner script (`pnpm db:migrate`, direct or session-pooler URL).
- Contract tests shared with `store-sqlite` (same suite, two adapters; the Postgres suite runs against `supabase start` locally or a test project).

**Phase 3: auth.**
- `apps/api/src/http/auth.ts`: `jose` JWKS verification (`iss`, `aud='authenticated'`, `exp`), then load `app_users` and reject when disabled, then set `c.var.user`. Under `AUTH_MODE=none` (local default) use `LOCAL_OWNER`.
- Replace the loopback `Host` check with `ALLOWED_HOSTS` (Vercel domain(s)) when `AUTH_MODE=supabase`.
- `POST /api/session` sets the asset cookie.
- Web: `apps/web/src/auth/` (supabase-js client, sign-in page, session refresh, route guard); attach the bearer token in `api/client.ts`.

**Phase 4: blobs and uploads.**
- `apps/api/src/infra/supabase-blob-store.ts` (`BlobStore` port; secret key).
- `POST /api/uploads` + `POST /api/books/import { path }`; keep multipart upload in local mode.
- Web `upload-dropzone.tsx` switches on a capability flag from `GET /api/config`.
- Export writes to the `exports` bucket and returns `{ url }` (signed, 300 s).
- An EPUB-bytes LRU (keyed by `owner_id:sha256`) per Fluid instance, plus optional `book_chapters` extraction at import, to protect egress.

**Phase 5: client-driven translation (BYOK direct).**
- Core `planWorkUnit` / `applyWorkResult` use cases extracted from `JobRunner.runTask` and `BatchRunner`, so the local runner and the remote protocol share them.
- API: `POST …/lease`, `POST …/results`, `POST …/batches`, `PATCH …/batches/:id`; `work_leases` table.
- Web: `apps/web/src/translate/work-loop.ts` (concurrency, retry, cancel through `AbortController`), batch submit and poll UI, progress from local state + `GET /api/jobs/:id` polling. In local mode keep `translate`, `translate-all` and SSE unchanged.
- Glossary suggest moves client-side too (term extractor in the browser).

**Phase 6: key manager.**
- `apps/web/src/keys/`: `vault.ts` (PBKDF2-SHA256 600k → AES-GCM-256, versioned envelope in IndexedDB, AAD binding, idle lock); `use-provider-key.ts`; settings UI (add, replace or forget per provider, show `last4`, unlock prompt, "stay unlocked" opt-in, Gemini "restrict key to Gemini API" hint).
- `GET /api/providers` in deployed mode returns models and capabilities without `configured` from server env.
- Tests: round-trip, wrong passphrase, tampered AAD, IV uniqueness.

**Phase 7: proxy fallback (only if a provider lacks CORS).**
- `POST …/step` with an `X-Provider-Key` header.
- `packages/providers` `createClient(provider, key, { maxRetries:0, logLevel:'off', openTelemetry:false })`.
- `redactKey(err, key)` applied in `mapAnthropicError`, `mapOpenAIError` and the Gemini equivalent, and before `jobs.update({error})`.
- Tests that a fake key never appears in a response, a log spy or a DB row.

**Phase 8: invites and admin.**
- `invites` + `app_users` tables.
- `POST /api/admin/invites`, `GET/DELETE /api/admin/invites/:id`, `POST /api/invites/accept`, `GET /api/admin/users`, `POST /api/admin/users/:id/{disable,enable,reset-link,delete}` (admin guard = `ADMIN_EMAILS` ∩ `role='admin'`).
- Web `/invite` and `/admin` routes. Bootstrap script `pnpm admin:create`.

**Phase 9: Vercel config and hardening.**
- Root `vercel.json` `services` { `web`: root `apps/web`, Vite build; `api`: root `apps/api`, entrypoint `src/index.ts` } + rewrites; security headers + CSP for `web`; `Cache-Control: no-store` on `/api/*`.
- Env as Secret: `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `DATABASE_URL` (pooler 6543), `ADMIN_EMAILS`, `AUTH_MODE=supabase`, `ALLOWED_HOSTS`; `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY` as Config.
- Standard Deployment Protection on.
- `MAX_UPLOAD_BYTES = 50 MB` in deployed mode.
- Backup: scheduled `pg_dump` + storage sync to the Mac.
- README section "Deploying to Vercel + Supabase".

---

## Recommended path

| Concern | Choice | Source |
|---|---|---|
| Hosting | Vercel Hobby, Services (beta): Vite + Hono on one origin | [Services](https://vercel.com/docs/services), [Hono](https://vercel.com/docs/frameworks/backend/hono) |
| Function limits to design around | 300 s, 4.5 MB request **and** response, 4 h Active CPU, 360 GB-hrs | [limits](https://vercel.com/docs/functions/limitations), [fair use](https://vercel.com/docs/limits/fair-use-guidelines) |
| Preview safety | Standard Deployment Protection | [Deployment Protection](https://vercel.com/docs/deployment-protection) |
| DB | Supabase Postgres via transaction pooler 6543, postgres.js `prepare:false`, `max:1` | [connecting](https://supabase.com/docs/guides/database/connecting-to-postgres) |
| Isolation | `owner_id` on every table + RLS `(select auth.uid()) = owner_id`, set per transaction | [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), `auth.uid()` source |
| Files | Private buckets, `<uid>/books/<sha>.epub`, signed upload (2 h) and signed download (≤ 300 s) | [storage access](https://supabase.com/docs/guides/storage/security/access-control), [signed upload](https://supabase.com/docs/reference/javascript/storage-from-createsigneduploadurl) |
| Auth | Email + password, sign-ups off, JWKS (ES256) verification + `app_users.disabled` check | [signing keys](https://supabase.com/docs/guides/auth/signing-keys), [sessions](https://supabase.com/docs/guides/auth/sessions) |
| Invites | Own `invites` table (hashed one-time token in a URL fragment) + `auth.admin.createUser` on accept | `supabase/auth` source; [createUser](https://supabase.com/docs/reference/javascript/auth-admin-createuser) |
| Password reset | Admin-generated `recovery` link (no email) | `mail.go`; [SMTP](https://supabase.com/docs/guides/auth/auth-smtp) |
| Provider calls | Browser → provider directly; proxy step with `X-Provider-Key` only as a fallback | SDK source; [Anthropic TS SDK](https://platform.claude.com/docs/en/cli-sdks-libraries/sdks/typescript) |
| Key at rest | PBKDF2-SHA256 600k → AES-GCM-256 envelope in IndexedDB; non-extractable key in memory while unlocked | [OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), [MDN](https://developer.mozilla.org/en-US/docs/Web/API/AesGcmParams) |
| Execution | Client-driven leases (live) and client-polled vendor batches; DB holds progress only | Design; [Workflows](https://vercel.com/docs/workflows) (rejected) |
| Progress | Client state + polling; no SSE or Realtime | Design |
| Local mode | Unchanged composition (SQLite, fs, env keys, runner, SSE) behind async ports | repo |
| Rejected | Vercel Authentication as the user gate (Vercel accounts only); Workflows, Queues, Edge Functions or pg_cron with keys; `generateLink` invite; built-in SMTP; sessionStorage/localStorage plaintext keys | above |

## Open decisions

- **D1.** After the Phase 0 CORS spike: if OpenAI or Gemini rejects browser calls, accept the proxy fallback (key transits Vercel, redacted) for that provider only, or drop that provider in deployed mode?
- **D2.** KDF: ship PBKDF2-SHA256 600k (native, no CSP change), or Argon2id via `hash-wasm` (stronger against offline cracking; adds a dependency and `'wasm-unsafe-eval'`)?
- **D3.** Offer the "stay unlocked on this device" option (derived `CryptoKey` in IndexedDB with expiry), or memory-only unlock per tab?
- **D4.** Asset auth for `<img>`: HttpOnly cookie on `/api/books/*` (option a), or blob URLs (option b)?
- **D5.** Egress protection: extract chapter XHTML into `book_chapters` at import (more DB space, minimal egress), or rely on a per-instance LRU only?
- **D6.** Custom SMTP later (self-service password reset), or stay admin-generated links forever?
- **D7.** Staging: use the second free Supabase project for Vercel previews, or let previews share production (protected by Standard Protection)?

## Verification notes

**Main-session CORS probe (2026-10-28, no keys sent):** `OPTIONS` preflights from Origin `https://epub-translator.vercel.app` returned 200 with permissive `access-control-allow-origin` for `api.anthropic.com/v1/messages` (`*`), `api.openai.com/v1/responses` and `/v1/batches` (`*`), and `generativelanguage.googleapis.com/v1beta/models/*:generateContent`, `:batchGenerateContent` and `/v1beta/batches/*` (origin echoed; only when requesting `content-type,x-goog-api-key` — requesting unrelated headers such as `authorization` returns 403). D1 is resolved: direct browser calls work for all three providers; no proxy fallback is needed.

All pages read 2026-10-28.

| Claim | Status | Source |
|---|---|---|
| Hono zero-config entrypoints, `serveStatic` ignored, Fluid default | CONFIRMED (page 2026-08-10) | [Hono on Vercel](https://vercel.com/docs/frameworks/backend/hono) |
| Services beta on all plans; original path preserved | CONFIRMED | [Services](https://vercel.com/docs/services), [routing](https://vercel.com/docs/services/routing) |
| SPA deep-link fallback under Services | UNVERIFIED | Phase 0 |
| Hobby 300 s, 2 GB/1 vCPU, 4.5 MB request/response, 1,024 FDs | CONFIRMED (2026-08-24) | [limits](https://vercel.com/docs/functions/limitations) |
| Hobby 1M invocations, 4 h Active CPU, 360 GB-hrs, 100 GB FDT; non-commercial | CONFIRMED (2026-09-14) | [fair use](https://vercel.com/docs/limits/fair-use-guidelines) |
| Hobby can lower function memory | UNVERIFIED | — |
| Runtime log fields include User Agent and Search Params, not arbitrary headers; 1 h Hobby retention | CONFIRMED as documented; internal header retention UNVERIFIED | [runtime logs](https://vercel.com/docs/logs/runtime) |
| Drains Pro/Enterprise only | CONFIRMED | [drains](https://vercel.com/docs/drains) |
| Workflows record step inputs; owners read decrypted run data | CONFIRMED | [Workflows](https://vercel.com/docs/workflows) |
| Vercel Authentication = Vercel users only; Standard Protection on all plans; no Password Protection on Hobby | CONFIRMED | [Deployment Protection](https://vercel.com/docs/deployment-protection) |
| Supabase Free quotas (500 MB, 1 GB, 50 MB, 5 GB, 50k MAU, 200 RT, 2 projects, 1-week pause) | CONFIRMED | [pricing](https://supabase.com/pricing) |
| Pause restore window 1 year; dashboard "Resume project"; auto-wake on request | CONFIRMED / auto-wake UNVERIFIED (not stated) | [pausing](https://supabase.com/docs/guides/platform/free-project-pausing) |
| Built-in SMTP team-only, 2/h; custom 30/h default | CONFIRMED | [SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [rate limits](https://supabase.com/docs/guides/auth/rate-limits) |
| `DisableSignup` not enforced on admin invite, generate_link or create | CONFIRMED from source (`supabase/auth` `c3348e8`); not stated in docs | `internal/api/{signup,invite,mail,admin,api}.go` |
| `generateLink` invite creates the user; response fields | CONFIRMED from source | `internal/api/mail.go` |
| Hosted default email OTP / link expiry | UNVERIFIED (self-host default 86400 s) | `internal/conf/configuration.go` |
| New projects default to asymmetric keys | UNVERIFIED | [signing keys](https://supabase.com/docs/guides/auth/signing-keys) |
| JWKS path; 10 + 10 min caching; `aud = authenticated`; 1 h JWT default | CONFIRMED | [signing keys](https://supabase.com/docs/guides/auth/signing-keys), [JWT fields](https://supabase.com/docs/guides/auth/jwt-fields), [sessions](https://supabase.com/docs/guides/auth/sessions) |
| `auth.uid()` reads `request.jwt.claims` | CONFIRMED from source | `migrations/20220224000811_update_auth_functions.up.sql` |
| `set local role` + claims behind the transaction pooler as a supported pattern | UNVERIFIED (design inference) | — |
| Pooler 6543, no prepared statements, IPv4-only; Vercel guidance | CONFIRMED | [connecting](https://supabase.com/docs/guides/database/connecting-to-postgres) |
| Signed upload URL 2 h; `uploadToSignedUrl` params; storage RLS folder pattern | CONFIRMED | Storage refs above |
| Bucket `file_size_limit` / `allowed_mime_types` field names | UNVERIFIED | [buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals) |
| Anthropic browser header, log redaction, retries/timeout defaults | CONFIRMED (SDK 1.2.0 source + docs) | `node_modules/.pnpm/@anthropic-ai+sdk@1.2.0…`, [TS SDK](https://platform.claude.com/docs/en/cli-sdks-libraries/sdks/typescript) |
| OpenAI `dangerouslyAllowBrowser`, `logLevel`, log sanitizer | CONFIRMED (SDK 7.43.0 source) | `node_modules/.pnpm/openai@7.43.0…/client.js` |
| OpenAI and Gemini REST CORS for browsers | UNVERIFIED | Phase 0 |
| OpenAI 401 message echoes a masked key | UNVERIFIED (not in docs) | [error codes](https://developers.openai.com/api/docs/guides/error-codes) |
| Gemini key in `x-goog-api-key`; "rejects requests from unrestricted standard keys" | CONFIRMED | `@google/genai` 2.31.0 source; [API key](https://ai.google.dev/gemini-api/docs/api-key) |
| OWASP PBKDF2 600k / Argon2id params; Web Storage + XSS | CONFIRMED | [Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), [HTML5](https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html) |
| WebCrypto: PBKDF2/HKDF only; AES-GCM IV guidance; CryptoKey serializable | CONFIRMED | [deriveKey](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveKey), [AesGcmParams](https://developer.mozilla.org/en-US/docs/Web/API/AesGcmParams), [WebCrypto §13.5](https://w3c.github.io/webcrypto/) |
| Argon2 in WebCrypto = WICG unofficial draft; `hash-wasm` 4.12.0 Argon2id | CONFIRMED | [WICG](https://wicg.github.io/webcrypto-modern-algos/), npm registry + [README](https://github.com/Daninet/hash-wasm) |
| Vendor batch result retention windows | UNVERIFIED | — |
| Repo facts: core/providers have no `node:` imports; sync repo ports; `books/<sha>.epub` key; DOMPurify config; `<img>`/`EventSource` usage | CONFIRMED by reading source 2026-10-28 | `packages/core/src/ports/stores.ts`, `usecases/import-book.ts`, `apps/web/src/lib/sanitize.ts`, `apps/web/src/api/client.ts` |
