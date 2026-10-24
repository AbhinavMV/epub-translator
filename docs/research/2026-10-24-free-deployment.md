# EPUB translator: free deployment options

Date: 2026-10-24. Scope: how to make the current app (Hono API on `@hono/node-server` with an in-process job runner, SSE progress, SQLite through better-sqlite3, EPUB files on local disk, and a Vite SPA) reachable from a phone or anywhere, at zero cost and without letting strangers spend the owner's LLM credit or read copyrighted books. Covers always-free compute, serverless/edge platforms, self-hosting behind a tunnel, authentication, and the code changes each path needs.

All facts come from primary sources: official pricing, limits and docs pages, specs, and the repo itself. Every page was read on **2026-10-24**. Free-tier terms change often, so the limits below are quoted exactly as written that day. **UNVERIFIED** marks anything not confirmed from a primary source. Sentences that begin "Recommendation" or "Design" are this document's judgement, not sourced fact.

---

## Summary of decision-relevant findings

1. **The app needs one thing most free tiers lack: an always-on process with a persistent disk.** The in-process runner translates chapters for minutes, the batch poller fires every `BATCH_POLL_INTERVAL_MS` (default 60 s, `apps/api/src/config.ts`), and SQLite (`translator.db`, WAL) plus the uploaded EPUBs live under `DATA_DIR` (`apps/api/src/services.ts`). Any platform that sleeps, or that wipes local files on restart, loses jobs, SSE streams and data.
2. **Recommendation (a), zero cost with no data leaving the Mac: keep it running on the Mac and reach it with Tailscale Serve.** The Personal plan is free for "Up to 6 users" with "Unlimited user devices" ([pricing](https://tailscale.com/pricing)). Serve shares a service "only with other devices in your tailnet", provisions TLS for the tailnet name, and adds a `Tailscale-User-Login` identity header ([Serve](https://tailscale.com/kb/1312/serve)). Nothing is public, so the tailnet itself is the authentication layer. The one cost is that the Mac must be awake.
3. **Cloudflare Tunnel plus Access is the public-URL alternative, but it is not zero cost unless you already own a domain.** The Zero Trust Free plan is "$0 … forever" for up to 50 users ([plans](https://www.cloudflare.com/plans/sase-zero-trust/)). But publishing through a tunnel requires that "you must add a website to Cloudflare" ([create tunnel](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/get-started/create-remote-tunnel/)). The free alternative, Quick Tunnels, "do not support Server-Sent Events (SSE)" and offer no Access ([Quick Tunnels](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/)). A Cloudflare Free zone also caps uploads at 100 MB ([default cache behavior](https://developers.cloudflare.com/cache/concepts/default-cache-behavior/)), below the app's 200 MB `MAX_UPLOAD_BYTES`.
4. **Recommendation (b), truly hosted for free: an Oracle Cloud Always Free Ampere A1 VM, reached privately over Tailscale.** The current allowance is "1,500 OCPU hours and 9,000 GB hours per month … equivalent to 2 OCPUs and 12 GB of memory", plus "a total of 200 GB of Block Volume storage" and "10 TB per month of outbound data", "for the life of the account" ([Always Free resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/resourceref.htm)). This is **half** the 4 OCPU / 24 GB that many 2026 guides still quote. The main risk: "Idle Always Free compute instances may be reclaimed" when, over 7 days, 95th-percentile CPU, network **and** (on A1) memory are all below 20%. A single-user app at rest will meet that test.
5. **The fallback hosted VM is the Google Cloud e2-micro.** It gives "1 non-preemptible `e2-micro` VM instance per month" in us-west1, us-central1 or us-east1, "30 GB-months of standard persistent disk", and "1 GB of outbound data transfer from North America per month". It requires a billing account ([free features](https://docs.cloud.google.com/free/docs/free-cloud-features), page updated 2026-10-22). With only 1 GB RAM and a 0.25 fractional vCPU ([machine types](https://docs.cloud.google.com/compute/docs/general-purpose-machines)) it is tight, but it has no idle-reclamation clause.
6. **No PaaS free tier fits as-is.**
   - Fly.io: "New organizations don't have a free tier"; the trial is "2 hours of Machine runtime or 7 days" ([pricing](https://docs.fly.io/about/pricing)).
   - Render Free: spins down after "15 minutes without receiving any inbound traffic", and "Free web services cannot" attach persistent disks ([free](https://render.com/docs/free)).
   - Railway: a "$5" trial for 30 days, then "$1 of free credit per month"; trial volumes are deleted 30 days after the credits expire ([trial](https://docs.railway.com/reference/pricing/free-trial)).
   - Koyeb: one 512 MB / 0.1 vCPU / 2 GB SSD free service that scales to zero after 1 h, which "cannot be disabled" ([pricing FAQ](https://www.koyeb.com/docs/faq/pricing), [scale-to-zero](https://www.koyeb.com/docs/run-and-scale/scale-to-zero)).
   - Hugging Face: Docker Spaces "require a paid plan to create" ([Spaces](https://huggingface.co/docs/hub/spaces-overview)).
   - Northflank Sandbox is the one exception worth testing: "Always on, no sleeping", "No card needed", volumes "included" ([pricing](https://northflank.com/pricing)). Its free volume quota is not documented (**UNVERIFIED**).
7. **Serverless/edge does not fit without a rewrite.** Vercel Hobby functions get "300s" max duration and a "4.5 MB" request body limit ([limits](https://vercel.com/docs/functions/limitations)). Netlify gets a "60 seconds" synchronous limit and a "6 MB" buffered payload ([config](https://docs.netlify.com/build/functions/configuration.md)). Workers' filesystem is "memory-based" and `/tmp` is "unique to each request" ([fs](https://developers.cloudflare.com/workers/runtime-apis/nodejs/fs/)). A port to Cloudflare means D1 + R2 + Durable Objects/Queues: the whole store, blob and runner layer.
8. **better-sqlite3 13.0.3 needs no native build in Docker or on an ARM VM.** The installed package ships `prebuilds/` for `linux-arm64`, `linux-x64`, `linuxmusl-arm64` and `linuxmusl-x64` (plus darwin and win32), with `"gypfile": false` (`node_modules/.pnpm/better-sqlite3@13.0.3`, inspected 2026-10-24). The v13.0.0 notes say binaries "are now published with the package itself" ([releases](https://github.com/WiseLibs/better-sqlite3/releases)).
9. **Any hosted option needs the same small set of code changes:**
   - an env-driven allowed-hosts list (today `app.ts` returns 403 for any Host that isn't `localhost`, `127.0.0.1` or `[::1]`)
   - Hono serving `apps/web/dist` on the same origin
   - `HOST=0.0.0.0` only inside containers
   - a `/api/health` route
   - a production start command
   - a SQLite backup job

   The Tailscale-on-Mac path needs only the first two.
10. **Recommendation for auth: rely on the network layer (Tailscale), not app code.** If anything is ever public, put Cloudflare Access in front and validate `Cf-Access-Jwt-Assertion` at the origin ([validate JWT](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)). Hono `bearerAuth` would break the progress stream: the web client uses `new EventSource(url)` (`apps/web/src/api/client.ts:75`), and `EventSourceInit` has only `withCredentials`, with no custom headers ([WHATWG SSE](https://html.spec.whatwg.org/multipage/server-sent-events.html)).

---

## 1. What the app requires of a host (from the repo)

| Requirement | Evidence | Consequence |
|---|---|---|
| Long-lived Node 24 process | `main.ts` starts `serve()` and `startBatchPolling()`; `.nvmrc` = `24` | Scale-to-zero or spin-down kills running chapters and the poller |
| SSE progress | `http/jobs.ts` `streamSSE` with a `: ping` heartbeat every `HEARTBEAT_MS = 15_000` | The 15 s heartbeat is under Cloudflare's 125 s proxy read timeout ([524](https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-5xx-errors/error-524/)), so proxies are OK |
| Persistent disk | `services.ts`: `translator.db` and `FsBlobStore(dataDir)`; `db.ts`: `journal_mode = WAL` | Needs a real volume; the WAL files (`-wal`, `-shm`) must sit on the same local filesystem |
| Native module | better-sqlite3 13.0.3 (prebuilt for linux x64/arm64, glibc and musl) | No toolchain needed in the image; serverless runtimes that forbid native addons are out |
| Uploads up to 200 MB | `http/books.ts` `MAX_UPLOAD_BYTES = 200 * 1024 * 1024` | Exceeds the Cloudflare Free 100 MB, Vercel 4.5 MB and Netlify 6 MB limits; real books are 1–10 MB |
| Loopback-only Host check | `app.ts` `LOCAL_HOSTS` → 403 "Forbidden host" | Every non-localhost deployment needs an allowlist |
| Binds 127.0.0.1 by default | `config.ts` `HOST` default `"127.0.0.1"` | Correct behind a same-machine proxy (Tailscale, cloudflared); containers need `0.0.0.0` |
| No compiled API build | `apps/api` has `start: tsx --env-file-if-exists=.env src/main.ts` and no `build` script; workspace packages export `./src/index.ts` | Either ship `tsx` and the sources, or bundle |
| SPA served by Vite dev with a `/api` proxy | `apps/web/vite.config.ts` | Production needs one origin that serves `dist/` and `/api` |
| Keys in server env, no auth | `.env.example` | Any public URL without auth exposes the owner's LLM credit |

---

## 2. Always-on free compute with a persistent disk

All pages read 2026-10-24.

### 2.1 Comparison

| Platform | Free allowance (exact) | Always-on? | Persistent disk? | Fits current arch? | Card required? | Gotchas |
|---|---|---|---|---|---|---|
| **Oracle Cloud Always Free, A1** ([resourceref](https://docs.oracle.com/en-us/iaas/Content/FreeTier/resourceref.htm)) | "1,500 OCPU hours and 9,000 GB hours per month" = "2 OCPUs and 12 GB"; also 2× E2.1.Micro (1/8 OCPU, 1 GB, "up to 50 Mbps") | Yes, "for the life of the account" | Yes: 200 GB combined boot + block, "five volume backups"; min boot 47 or 50 GB (the page contradicts itself) | **Yes** (arm64 prebuild exists) | **UNVERIFIED** (signup page not read) | Idle reclamation (7 d, CPU p95 / network / memory <20%). Home region only. "out of host capacity" errors happen. Whether reclamation also applies after upgrading to PAYG is not stated. |
| **Google Cloud e2-micro** ([free features](https://docs.cloud.google.com/free/docs/free-cloud-features)) | 1 e2-micro (2 vCPU exposed, 0.25 fractional, 1 GB) in us-west1/us-central1/us-east1; 30 GB-month standard PD; 1 GB egress/month from North America | Yes | Yes (PD) | Yes, but 1 GB RAM is tight for `pnpm install` and a build (**UNVERIFIED** in practice) | "A Google Cloud billing account is required" | US regions only; 1 GB egress/month; Google may change terms "with 30 days' advance notice" |
| **Northflank Sandbox** ([pricing](https://northflank.com/pricing)) | "2" services, "2" jobs, "1" addon; "Up to $20 per month of resources"; compute "Limited" | "Always on, no sleeping" | Volumes "included"; size and count quota **UNVERIFIED** ([quotas](https://northflank.com/docs/v1/application/billing/resource-plans-and-quotas.md): "Free projects have separate limits", not listed) | Probably (Docker); RAM of the free plan **UNVERIFIED** | "No card needed" | Undocumented free quotas; terms undated on the page |
| **Fly.io** ([pricing](https://docs.fly.io/about/pricing)) | None for new orgs; trial "up to 2 hours of Machine runtime or 7 days" | n/a | Volumes "$0.15/GB" per month | Yes, technically | "All organizations … must have a credit card on file" | Legacy free allowances (3× 256 MB VMs, 3 GB volumes) apply only to orgs that were on those plans before 2024-10-07 ([discontinued](https://docs.fly.io/about/discontinued-plans/)) |
| **Render Free** ([free](https://render.com/docs/free)) | 750 instance hours/workspace/month | No: spins down after 15 min idle, about 1 min to wake | No ("Free web services cannot") | No | Not stated | Filesystem "lost every time the service redeploys, restarts, or spins down"; RAM/CPU not stated on the page |
| **Railway** ([trial](https://docs.railway.com/reference/pricing/free-trial)) | "$5" one-time, 30 days; then "$1 of free credit per month"; "1 GB of RAM" | Only while credit lasts | Volumes, but trial volumes are deleted 30 days after credits expire | Yes until credit runs out | Not stated | $1/month won't run a 24/7 service (**UNVERIFIED** arithmetic; Railway's unit prices not read) |
| **Koyeb** ([FAQ](https://www.koyeb.com/docs/faq/pricing), updated 2026-05-27) | One free web service: 512 MB, 0.1 vCPU, 2 GB SSD, Frankfurt or Washington D.C. | No: scales to zero after 1 h, "cannot be disabled" ([s2z](https://www.koyeb.com/docs/run-and-scale/scale-to-zero)); an open connection holds it up | Volumes listed under the $29/mo Pro plan ([pricing](https://www.koyeb.com/pricing)) | No (no persistent disk) | Card with a "$29 pre-authorization hold" | 0.1 vCPU |
| **Hugging Face Spaces** ([overview](https://huggingface.co/docs/hub/spaces-overview)) | CPU Basic 2 vCPU / 16 GB free, but "Gradio and Docker Spaces … require a paid plan to create" | No: free hardware will "go to sleep" | "50GB of (not persistent) disk" | No | n/a | Not free for Docker in 2026 |
| **AWS Free Tier** ([free](https://aws.amazon.com/free/)) | "$100 in credits", up to $100 more; account "closes automatically 6 months after opening" | 6 months at most | EBS (within credits) | Yes, temporarily | Not stated on the page | Not always-free for compute |
| **Azure** ([free services](https://azure.microsoft.com/en-us/pricing/free-services)) | "free monthly amounts … for 12 months"; must "move to pay as you go within 30 days" to keep them; VM SKU and hours not on the captured page (750 h B1s/B2pts v2/B2ats v2 + P6 disk from the [Marketplace listing](https://marketplace.microsoft.com/en-us/product/azure-services/microsoft.freeaccountvirtualmachine), **UNVERIFIED**) | 12 months | Managed disk (12 months) | Yes, temporarily | **UNVERIFIED** | Not always-free |

### 2.2 Oracle A1 reading

- **Reclamation is the main risk.** At rest, a 12 GB VM running one Node process idles well under 20% CPU, network and memory, and A1 shapes are judged on all three. Mitigations:
  - Upgrade the tenancy to Pay As You Go. "Oracle doesn't charge for Always Free resources after you upgrade" ([resourceref](https://docs.oracle.com/en-us/iaas/Content/FreeTier/resourceref.htm)). Whether reclamation then stops is **UNVERIFIED**.
  - Size the VM smaller (for example 1 OCPU / 6 GB) so the app's resident memory is a larger share. That this keeps memory above 20% is **UNVERIFIED** without measuring.
  - Don't run synthetic load to dodge the rule. Recommendation: avoid it; it is against the spirit of the terms.
- **Capacity:** A1 creation can fail with "out of host capacity". Retry another availability domain or later.
- **Backups:** the 200 GB includes "five volume backups", which is enough for weekly boot and data snapshots in addition to the app-level SQLite backup (§6).

### 2.3 Google e2-micro reading

- 1 GB RAM is enough to *run* the API: one Node process, a SQLite page cache, and EPUB parsing of books up to 10 MB in memory. Whether `pnpm install` and a Vite build fit is **UNVERIFIED**. Design: build in CI or on the Mac and ship artifacts (or a Docker image) to the VM, rather than building on it.
- The 1 GB/month egress covers single-user use: SPA assets, JSON, and occasional 1–10 MB EPUB downloads. Tailscale traffic leaving the VM counts as egress too (**UNVERIFIED** how Google classifies it; assume it counts). LLM API calls are outbound requests with small bodies; responses are ingress.

---

## 3. Serverless and edge

| Platform | Hard limits that matter (exact) | Why it doesn't fit as-is | Port cost |
|---|---|---|---|
| Vercel Hobby ([limits](https://vercel.com/docs/functions/limitations), updated 2026-08-24) | Max duration "300s (5 minutes)"; body "4.5 MB"; 2 GB / 1 vCPU | No persistent filesystem, so SQLite and blobs need external services. Chapter jobs and SSE outlive 300 s. | Move jobs to Vercel Workflows plus external DB and blob storage (not researched) |
| Netlify ([config](https://docs.netlify.com/build/functions/configuration.md)) | Sync "60 seconds", background "15 minutes", buffered payload "6 MB" (about 4.5 MB for binary), streamed "20 MB" | Same reasons; 60 s kills SSE | Similar to Vercel |
| Cloudflare Workers Free ([limits](https://developers.cloudflare.com/workers/platform/limits/)) | "100,000 requests" per day, "10 ms" CPU per request, "128 MB" per isolate, "50" subrequests, 100 MB body on a Free zone; no wall-clock limit for streaming; `waitUntil` up to 30 s | In-memory VFS, so no better-sqlite3 and no `node:fs` persistence ([fs](https://developers.cloudflare.com/workers/runtime-apis/nodejs/fs/)). Native-addon support is not stated (**UNVERIFIED**; assume no). Containers are "N/A" on Free ([containers](https://developers.cloudflare.com/containers/pricing/)). | D1 Free: "5 million" rows read and "100,000" rows written per day, "5 GB" ([D1](https://developers.cloudflare.com/d1/platform/pricing/)). R2: "10 GB-month", 1M Class A, 10M Class B, egress free ([R2](https://developers.cloudflare.com/r2/pricing/)). Durable Objects (SQLite only): 100k req/day, "13,000 GB-s per day" ([DO](https://developers.cloudflare.com/durable-objects/platform/pricing/)). Queues: "10,000 operations/day", 24 h retention ([Queues](https://developers.cloudflare.com/queues/platform/pricing/)). That means rewriting `store-sqlite`, `FsBlobStore` and the runner, and 10 ms CPU per request is tight for EPUB parsing (**UNVERIFIED**). |
| Google Cloud Run ([timeout](https://docs.cloud.google.com/run/docs/configuring/request-timeout), [free](https://docs.cloud.google.com/free/docs/free-cloud-features)) | Timeout default 300 s, max "60 minutes (3600 seconds)"; free "2 million requests", "180,000 vCPU-seconds", "360,000 GB-seconds" per month (request-based billing) | With request-based billing the in-process runner gets CPU only during requests (**UNVERIFIED**; billing-mode page not read). No local persistence, so SQLite needs an external DB. | Swap the store for a hosted DB and GCS; move the runner to Cloud Tasks or Jobs |

Recommendation: none of these is worth the rewrite for a single-user tool. The repo's architecture (ports in `packages/core`) would allow a D1/R2 adapter later, but it is not a "deploy for free" step.

---

## 4. Self-host on the Mac and add a free tunnel

| Option | Free terms (exact) | Private / auth | SSE | Uploads | Domain needed? | Gotchas |
|---|---|---|---|---|---|---|
| **Tailscale Serve** ([pricing](https://tailscale.com/pricing), [Serve](https://tailscale.com/kb/1312/serve)) | Personal: "Up to 6 users", "Unlimited user devices" | Tailnet-only; identity headers `Tailscale-User-Login`, `Tailscale-User-Name` | Plain reverse proxy; streaming expected to work (**UNVERIFIED**, no doc statement) | No documented cap (**UNVERIFIED**) | No: uses the `*.ts.net` tailnet name; "requires you to enable HTTPS certificates in your tailnet" | Phone needs the Tailscale app; Mac must be awake; the Host header seen by the API is likely the `ts.net` name (**UNVERIFIED**), so it must be allowlisted |
| **Tailscale Funnel** ([Funnel](https://tailscale.com/kb/1223/funnel)) | "available for all plans"; ports 443, 8443 and 10000 only; "non-configurable bandwidth limits"; "currently in beta" | **Public**, no auth layer, and identity headers are not added to Funnel traffic | n/a | n/a | No | Exposes the app to the internet. Avoid without app auth. |
| **Cloudflare Tunnel + Access** ([Zero Trust plans](https://www.cloudflare.com/plans/sase-zero-trust/), [create tunnel](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/get-started/create-remote-tunnel/)) | Zero Trust Free "$0 … forever", "Teams under 50 users", logs "Up to 24 hours"; ZTNA and "Application Connector Software" included. That Tunnel itself is $0 is implied, not stated on a page read (**UNVERIFIED**). | Access login (email OTP or IdP) in front; origin can validate `Cf-Access-Jwt-Assertion` | 15 s heartbeat < 125 s proxy read timeout | **100 MB** max on a Free zone | **Yes**: "you must add a website to Cloudflare" | Domain cost (not free unless already owned); 100 MB upload cap |
| Cloudflare Quick Tunnel ([trycloudflare](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/)) | Free, random URL; "200 in-flight requests" | Public, no Access | **"do not support Server-Sent Events (SSE)"** | — | No | "for testing and development". Disqualified. |
| ngrok Free ([pricing](https://ngrok.com/pricing)) | "3 online endpoints", "1GB data transfer", "20k HTTP/S requests" per month, one assigned dev domain, interstitial page; OAuth for "3 monthly active users"; one-time $5 credit | OAuth possible | — | 1 GB/month total | No | The interstitial breaks `fetch`/`EventSource` on first load (**UNVERIFIED** in practice); low caps |

Recommendation: **Tailscale Serve** for path (a). It needs no domain, no public surface, no auth code, and holds up to 6 users if a friend ever needs access. Cloudflare Tunnel + Access is second choice, only if a plain browser URL without a VPN client matters and a domain is already owned.

Keeping the Mac awake: running the API under a `launchd` agent with `caffeinate -s` (or "Prevent automatic sleeping when the display is off" in System Settings) keeps jobs alive. The exact macOS 27 settings path is **UNVERIFIED**.

---

## 5. Authentication

| Option | Code needed | Works with EventSource? | Verdict |
|---|---|---|---|
| Tailscale tailnet (Serve) | None. Optionally check `Tailscale-User-Login` against an allowlist env. | Yes (network level) | **Recommended** |
| Cloudflare Access | Optional middleware to verify the `Cf-Access-Jwt-Assertion` JWT against `https://<team>.cloudflareaccess.com/cdn-cgi/access/certs`, plus `aud` and `iss` ([docs](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)) | Yes (cookie-based, set by Access) | Recommended if public via Cloudflare |
| Hono `basicAuth` ([docs](https://hono.dev/docs/middleware/builtin/basic-auth)) | `app.use("*", basicAuth({ username, password }))`; options `verifyUser`, `realm`, `hashFunction` | Browser caches Basic credentials for the origin, so same-origin `EventSource` should send them (**UNVERIFIED**; test on iOS Safari) | Acceptable last resort over HTTPS only; no logout or rate limiting; timing-safety not discussed in the docs |
| Hono `bearerAuth` | Token in an `Authorization` header | **No**: `EventSourceInit` has only `withCredentials` ([WHATWG](https://html.spec.whatwg.org/multipage/server-sent-events.html)) | Reject (or pass the token in the query string, which leaks into logs) |
| Own session login (cookie) | Login route, signed cookie, CSRF care | Yes | Over-engineering for one user |

Design: keep the Host-check middleware. Make it read an `ALLOWED_HOSTS` env (comma-separated, defaulting to today's loopback set) so DNS-rebinding protection survives on the deployed hostname.

---

## 6. Code and config changes for a deployment (not implemented)

| # | Change | Needed for | Notes |
|---|---|---|---|
| C1 | `ALLOWED_HOSTS` env in `config.ts`, used by the Host check in `app.ts` | All paths | Add the `*.ts.net` name, a Cloudflare hostname, or the VM name |
| C2 | Serve `apps/web/dist` from Hono with `serveStatic` from `@hono/node-server/serve-static`, plus an SPA fallback to `index.html` for non-`/api` GETs | All paths (removes Vite dev from production) | `root` "resolves paths relative to the current working directory" ([Hono Node](https://hono.dev/docs/getting-started/nodejs)); make it an env `WEB_DIST_DIR`. The docs give no SPA-fallback recipe, so write a `notFound`/catch-all that returns `index.html`. Register it after `/api` routes and keep JSON 404s for `/api/*`. |
| C3 | `GET /api/health` returns `{ ok: true }` after a trivial DB read | Hosted, Docker | For Docker `HEALTHCHECK` and platform probes |
| C4 | Production start: either keep `tsx` (simplest; it is a devDependency today, so move it to `dependencies`) or bundle `apps/api/src/main.ts` with esbuild (0.28.2 is already in the lockfile) using `--platform=node --format=esm --packages=external` for `better-sqlite3`; or try plain `node` | Hosted | Node 24.12+ strips types by default, but refuses `.ts` "inside any folder under `node_modules`" and rejects `enum` and parameter properties ([Node TS](https://nodejs.org/api/typescript.html)). Workspace packages resolve via `node_modules/@et/*` symlinks, so plain `node` is **UNVERIFIED**. tsconfig lacks `erasableSyntaxOnly`. |
| C5 | `HOST=0.0.0.0` in containers only; keep `127.0.0.1` on the Mac and VM behind Tailscale or cloudflared | Docker | Never bind 0.0.0.0 on a VM with a public IP unless the firewall blocks the port |
| C6 | `DATA_DIR` on the persistent volume (for example `/data`), with the volume mounted, not baked into the image | Hosted | WAL needs a local POSIX filesystem, not a network share (SQLite guidance; **UNVERIFIED** for each platform's volume type) |
| C7 | Multi-stage Dockerfile: `node:24-slim` (glibc) → `corepack enable` → `pnpm install --frozen-lockfile` → `pnpm build` (web) → `pnpm deploy --prod` or copy the workspace → runtime stage | Docker platforms (Northflank, optional on a VM) | better-sqlite3 ships glibc and musl prebuilds for x64 and arm64, so no `python3`/`make`/`g++` is needed. `pnpm deploy` behaviour with workspace `.ts` exports is **UNVERIFIED**. |
| C8 | Secrets: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` and `GEMINI_API_KEY` from the platform secret store or a root-only `/etc/epub-translator.env` on a VM (systemd `EnvironmentFile=`) | Hosted | Keep `.env` out of images |
| C9 | Backups: a nightly `db.backup(path)` (better-sqlite3 has `lib/methods/backup.js`) or `VACUUM INTO`, plus a copy of the blob directory, to off-machine storage | Hosted (also useful on the Mac) | The SQLite Online Backup API copies a live DB safely; a plain file copy "can leave a corrupt backup" ([backup](https://www.sqlite.org/backup.html)). On Oracle, add the "five volume backups". |
| C10 | Process supervision: systemd unit (VM) or `launchd` agent (Mac) with `Restart=always`; SIGTERM already closes the DB (`main.ts`) | VM, Mac | — |
| C11 | Optional: allowlist on `Tailscale-User-Login` or a `Cf-Access-Jwt-Assertion` check | Defence in depth | — |
| C12 | Lower `MAX_UPLOAD_BYTES` to 100 MB or document the cap | Cloudflare paths only | Free-zone limit is 100 MB |

---

## 7. Next steps

### Path A: Mac + Tailscale Serve (zero cost, data stays home)

1. **C1:** add `ALLOWED_HOSTS` and allow `<mac-name>.<tailnet>.ts.net`.
2. **C2:** serve `apps/web/dist` from Hono. Then `pnpm build && pnpm --filter @et/api start` gives one origin on `127.0.0.1:8787`.
3. Install Tailscale on the Mac and phone (Personal plan), enable HTTPS certificates in the tailnet admin console, then run `tailscale serve 8787` ([Serve](https://tailscale.com/kb/1312/serve)).
4. Open `https://<mac-name>.<tailnet>.ts.net` on the phone. Verify that the upload, a Live chapter job and the SSE progress all work. Check what Host header arrives (step 1 depends on it).
5. **C10:** add a `launchd` agent for the API and keep the Mac from sleeping while on power.
6. **C9:** nightly SQLite backup plus a `data/` copy (Time Machine already covers the Mac; a consistent `db.backup()` snapshot is still safer than copying a live WAL database).
7. Optional **C11:** allowlist your own `Tailscale-User-Login`.

### Path B: Oracle Always Free A1 VM + Tailscale (hosted, still private)

1. Create an OCI account and choose the home region carefully: Always Free compute and volumes exist "in your home region" only. Card requirement: **UNVERIFIED**.
2. Create a `VM.Standard.A1.Flex` (start at 1–2 OCPU, 6–12 GB) on Ubuntu or Oracle Linux arm64, with a 50 GB boot volume and optionally a separate block volume for `/data`. Keep the total ≤200 GB.
3. Close all ingress except SSH (or use Tailscale SSH), install Tailscale, and join the tailnet. No public HTTP port.
4. Install Node 24 and pnpm 10 (corepack). Either build on the VM or ship a bundle or image built in CI (**C4/C7**).
5. Apply **C1–C3, C6, C8, C10**: `DATA_DIR=/data`, keys in `EnvironmentFile`, a systemd unit, `HOST=127.0.0.1`, then `tailscale serve 8787`.
6. Apply **C9**: nightly `db.backup()` plus blob sync to OCI Object Storage (Always Free includes Object Storage; see the [resourceref](https://docs.oracle.com/en-us/iaas/Content/FreeTier/resourceref.htm) tiers) and scheduled volume backups.
7. Decide on reclamation risk (D2). Watch the console for idle notices in the first weeks.
8. If A1 capacity is unavailable: retry other availability domains, or fall back to the **GCP e2-micro**. The steps are the same, but build off-box because of the 1 GB RAM.

---

## Recommended path

| Concern | Choice |
|---|---|
| Where it runs | **A:** the Mac (now). **B:** an Oracle A1 Always Free VM if it must run while the Mac sleeps; GCP e2-micro as fallback |
| Reachability | Tailscale Serve (tailnet-only HTTPS on `*.ts.net`) |
| Auth | Tailnet membership; optional `Tailscale-User-Login` allowlist. Cloudflare Access only if a public URL is ever required. |
| Origin layout | One Hono process serving `/api/*` and `apps/web/dist` |
| Process | `tsx` start (no build change) first; esbuild bundle later |
| Storage | `DATA_DIR` on local disk or a block volume; SQLite WAL as today |
| Backups | `db.backup()` nightly + blob copy off-machine |
| Rejected | Render, Koyeb, HF Spaces (sleep or no disk); Fly.io, Railway, AWS, Azure (not free long-term); Vercel, Netlify, Workers (rewrite); Quick Tunnels (no SSE); Funnel and ngrok (public, no auth) |

## Open decisions

- **D1.** Is "deployed" satisfied by "reachable from my phone while the Mac is on" (Path A), or must jobs run while the Mac sleeps (Path B)?
- **D2.** Oracle: stay on the Always Free tenancy and accept idle-reclamation risk, or upgrade to Pay As You Go (card on file, no charge within Always Free limits) to reduce the risk? Whether PAYG reduces it is **UNVERIFIED**.
- **D3.** Will anyone other than you use it? If so, Tailscale's 6 users is enough; a public URL means Cloudflare Access and a domain.
- **D4.** Production start: keep `tsx` (zero change) or add an esbuild bundle and a Dockerfile now, which only Northflank or a container VM would need?
- **D5.** Backup target for Path B: OCI Object Storage, a pull to the Mac over Tailscale (`sqlite3_rsync` or rsync of the backup file), or both?
- **D6.** Should `MAX_UPLOAD_BYTES` drop to 100 MB to match Cloudflare Free if the Cloudflare path is ever chosen?

## Verification notes

All pages read 2026-10-24.

| Claim | Status | Source |
|---|---|---|
| Oracle A1 = 1,500 OCPU-h / 9,000 GB-h = 2 OCPU / 12 GB; 200 GB block; 10 TB egress; idle reclamation rule | CONFIRMED (page undated, © 2026). Widely-quoted 4 OCPU / 24 GB is outdated per this page. | [resourceref](https://docs.oracle.com/en-us/iaas/Content/FreeTier/resourceref.htm) |
| Oracle min boot volume 47 GB vs 50 GB | CONFLICTING within the same page | same |
| Oracle signup needs a card; reclamation after PAYG upgrade | UNVERIFIED | — |
| GCP e2-micro free terms; billing account required | CONFIRMED (page updated 2026-10-22) | [free features](https://docs.cloud.google.com/free/docs/free-cloud-features) |
| e2-micro = 2 vCPU exposed, 0.25 fractional, 1 GB | CONFIRMED | [machine types](https://docs.cloud.google.com/compute/docs/general-purpose-machines) |
| Fly.io: no free tier for new orgs; 2 h / 7 d trial; card required | CONFIRMED | [pricing](https://docs.fly.io/about/pricing) |
| Render Free: 15 min spin-down, no disks, 750 h | CONFIRMED; RAM/CPU not on the page (pricing page failed to render plan data) | [free](https://render.com/docs/free) |
| Railway: $5 / 30 d trial, then $1/month; 1 GB RAM | CONFIRMED; whether $1/month covers 24/7 is UNVERIFIED | [trial](https://docs.railway.com/reference/pricing/free-trial) |
| Koyeb free 512 MB / 0.1 vCPU / 2 GB, scale-to-zero after 1 h, not disableable | CONFIRMED | [FAQ](https://www.koyeb.com/docs/faq/pricing), [s2z](https://www.koyeb.com/docs/run-and-scale/scale-to-zero) |
| HF Docker Spaces need a paid plan | CONFIRMED | [Spaces overview](https://huggingface.co/docs/hub/spaces-overview) |
| Northflank Sandbox always-on, no card | CONFIRMED on the pricing page; free volume and RAM quotas UNVERIFIED | [pricing](https://northflank.com/pricing) |
| AWS: $100 (+$100) credits, 6-month closure | CONFIRMED | [free](https://aws.amazon.com/free/) |
| Azure 750 h B-series VMs + P6 disk, 12 months | UNVERIFIED (official page didn't render the list; Marketplace and Q&A only) | [Marketplace](https://marketplace.microsoft.com/en-us/product/azure-services/microsoft.freeaccountvirtualmachine) |
| Tailscale Personal: 6 users, unlimited devices | CONFIRMED (undated) | [pricing](https://tailscale.com/pricing) |
| Tailscale Serve identity headers; Funnel public, beta, ports | CONFIRMED | [Serve](https://tailscale.com/kb/1312/serve), [Funnel](https://tailscale.com/kb/1223/funnel) |
| Host header received through Tailscale Serve; SSE through Serve | UNVERIFIED (test in Path A step 4) | — |
| Cloudflare Zero Trust Free: 50 users, $0, 24 h logs | CONFIRMED | [plans](https://www.cloudflare.com/plans/sase-zero-trust/) |
| Cloudflare Tunnel needs a site on Cloudflare; Quick Tunnels no SSE | CONFIRMED | [create tunnel](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/get-started/create-remote-tunnel/), [trycloudflare](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/) |
| Cloudflare Tunnel itself is free | UNVERIFIED (implied by "Application Connector Software: Included" on Free) | [plans](https://www.cloudflare.com/plans/sase-zero-trust/) |
| Cloudflare Free 100 MB upload; 125 s proxy read timeout | CONFIRMED; that the upload cap applies to tunnel hostnames is inferred | [cache behavior](https://developers.cloudflare.com/cache/concepts/default-cache-behavior/), [524](https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-5xx-errors/error-524/) |
| ngrok Free caps | CONFIRMED | [pricing](https://ngrok.com/pricing) |
| Vercel / Netlify / Workers / D1 / R2 / DO / Queues / Containers / Cloud Run limits | CONFIRMED as quoted | links in §3 |
| Workers native-addon support | UNVERIFIED (not stated on the Node.js compat page) | [nodejs](https://developers.cloudflare.com/workers/runtime-apis/nodejs/) |
| better-sqlite3 13.0.3 ships linux/musl x64 + arm64 prebuilds, `gypfile: false` | CONFIRMED by inspecting the installed package | local `node_modules/.pnpm/better-sqlite3@13.0.3`, [releases](https://github.com/WiseLibs/better-sqlite3/releases) |
| EventSource cannot set headers | CONFIRMED | [WHATWG SSE](https://html.spec.whatwg.org/multipage/server-sent-events.html) |
| Hono `basicAuth` options; `serveStatic` import path | CONFIRMED; basicAuth with EventSource on mobile Safari UNVERIFIED | [basic-auth](https://hono.dev/docs/middleware/builtin/basic-auth), [nodejs](https://hono.dev/docs/getting-started/nodejs) |
| Node 24 type stripping rules | CONFIRMED; whether the repo runs under plain `node` is UNVERIFIED | [Node TS](https://nodejs.org/api/typescript.html) |
| Repo facts (Host check, HOST default, 200 MB cap, 15 s heartbeat, WAL, `new EventSource`) | CONFIRMED by reading source 2026-10-24 | `apps/api/src/{app,config}.ts`, `http/{books,jobs}.ts`, `packages/store-sqlite/src/db.ts`, `apps/web/src/api/client.ts` |
