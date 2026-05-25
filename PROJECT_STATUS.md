# Project Status & Handoff

> **Living handoff doc.** Read this top-to-bottom before continuing work on
> this repo. Update the "Latest update" section below + relevant subsections
> any time you ship a meaningful change.

**Latest update**: 2026-05-25 — PR #16 fixes a header-rule ordering bug so `/verify` now returns `X-Frame-Options: DENY` (was `SAMEORIGIN` due to a generic rule running last and overriding the specific rule). All 6 hardening PRs (#12 SVG, #13 Vitest, #14 Sentry, demo #1, #15 PROJECT_STATUS, #16 header order) merged to `main`. Production `sign.unigamalang.ac.id` live with everything green. See [Recent activity](#recent-activity).

---

## 1. What this is

A **self-hosted, single-tenant electronic-signature (TTE) platform** for institutional documents. The deployed instance at **https://sign.unigamalang.ac.id** is the production tenant for **Universitas Gajayana Malang**. The same codebase is mirrored in `digital-signature-demo` (generic branding) so any third-party org can fork and deploy their own copy.

**Trust model.** The institution self-hosts the verifier. Every signed document gets a unique token + QR code that points to `https://<org-domain>/verify/<token>` (controlled by the org, not a third party). HMAC-SHA256 over `(archiveId, number, subject, issuedAt, signatoryId, signatoryName, signatoryPosition, signedAt, token)` provides tamper-evidence; the secret stays in `SIGNATURE_SECRET` env var and never leaves the server.

## 2. Repos at a glance

| Repo | Branch | Purpose | Vercel project |
|---|---|---|---|
| [`weverxcom-hub/digital-signature`](https://github.com/weverxcom-hub/digital-signature) | `main` | Production UNIGA tenant. Live at https://sign.unigamalang.ac.id | `prj_YWeCQ9cgArGhawKL7vItrfiaJWhk` (team `weverxcom-9750s-projects`) |
| [`weverxcom-hub/digital-signature-demo`](https://github.com/weverxcom-hub/digital-signature-demo) | `main` | Open-source generic distribution. Has Deploy-to-Vercel button. Generic branding (Acme Foundation / your-org.example.com) | Not deployed (template repo) |

Both repos share the same source code & feature set. Demo repo strips UNIGA-specific defaults and has a richer README with deploy instructions; otherwise identical.

## 3. Tech stack

- **Framework**: Next.js 14.2.35 (App Router, server + edge runtimes)
- **Language**: TypeScript 5, React 18
- **Database**: PostgreSQL (Neon Singapore for production, plain postgres for local)
- **ORM**: Prisma 6 (`@prisma/client`, migrations via `prisma migrate deploy`)
- **Auth**: NextAuth 4 (credentials provider, bcrypt cost=12)
- **PDF**: `pdf-lib` (embed stamp into uploaded PDFs)
- **Image rendering**: `sharp` (SVG → PNG for QR + stamp)
- **QR codes**: `qrcode` (error correction `H` + center logo composite)
- **Rate limiting**: `@upstash/ratelimit` + `@upstash/redis` (sliding window, fail-open)
- **Error tracking**: `@sentry/nextjs` (server + edge + client + replay)
- **Tests**: Vitest 4 (50 unit tests, ~1s runtime)
- **Validation**: Zod 4
- **UI**: Tailwind CSS, `tailwind-merge`, `clsx`, `sonner` toasts
- **Fonts**: Inter TTF (Regular + Bold) bundled in `public/fonts/` for server-side SVG rendering

## 4. Architecture

### 4.1 Database schema

`prisma/schema.prisma` defines 7 models. Relevant ones:

- **`User`** — admin/super-admin/user with bcrypt password hash. `SUPER_ADMIN` is created via `/setup` endpoint (race-condition guarded by Serializable transaction; only the first POST wins).
- **`OrganizationProfile`** — single row (`id = "default"`). Holds org name, short name, tagline, address, website, logo (URL **and** uploaded `logoBytes`/`logoMimeType`), `primaryColor`, `verifyBaseUrl` (the public origin used to build QR URLs).
- **`Signatory`** — soft-deletable (`deletedAt`). Once any signature references a signatory, deleting them just hides from the active roster — historical signatures stay valid.
- **`Archive`** — the document container. Has `number`, `subject`, `issuedAt`, optional `documentSha256` (bound after embed-PDF), and computed `status` (`DRAFT` / `PENDING` / `FULLY_SIGNED` / `REVOKED`).
- **`ArchiveRequiredSignatory`** — many-to-many between Archive and required Signatories. Without rows here, the archive is single-signer.
- **`ArchiveSignature`** — the signature record. Stores frozen signatory snapshot (`signatoryName`, `signatoryPosition`, `signatoryUnit`), unique `token`, HMAC, `signedById`, `signedAt`, optional `revokedAt`/`revokedReason`/`revokedById`. Has a **partial unique index** `(archiveId, signatoryId) WHERE revokedAt IS NULL` to prevent race-condition duplicate active signatures.
- **`AuditLog`** — every mutation logged with action, entity, actor, JSON metadata. Actions: `CREATE`, `UPDATE`, `DELETE`, `SIGN`, `SIGN_REVOKE`, `EMBED_PDF`, `BIND_DOCUMENT`, `LOGIN`, `PROFILE_UPDATE`, `PROFILE_LOGO_UPLOAD`, `PROFILE_LOGO_REMOVE`, `USER_CREATE`.

Migration list (chronological, in `prisma/migrations/`):
- `20260512033401_init` — initial schema
- `20260512100000_multi_signer_status` — added `ArchiveStatus` enum + 1:N signatures
- `20260513230000_required_signers` — added `ArchiveRequiredSignatory`
- `20260513231000_logo_bytes` — added `logoBytes`/`logoMimeType`/`logoUpdatedAt` to OrganizationProfile
- `20260513233000_signature_active_unique` — partial unique index (initial attempt)
- `20260515214400_active_signature_unique` — corrected partial unique index
- `20260515215000_archive_document_sha256` — added `Archive.documentSha256`

All migrations are **additive**. None of them have ever touched HMAC payload composition or token format, so old signatures stay valid across all schema versions.

### 4.2 Pages (`src/app/`)

Public:
- `/` — landing page, brand hero, "How verification works" section, link to login
- `/login` — NextAuth credentials form
- `/setup` — first-run super-admin bootstrap (idempotent; HTTP 409 if already setup)
- `/about` — "About this system" page
- `/verify/[token]` — public verification result with archive details, signatory, status pill, document hash binding, optional PDF drop-zone for byte-for-byte hash check

Dashboard (auth required, `(dashboard)` route group):
- `/dashboard` — overview cards
- `/dashboard/archives` — list + create archive (multi-select required signatories)
- `/dashboard/archives/[id]` — archive detail, sign/revoke per signatory, QR/stamp preview, PDF embed form
- `/dashboard/signatories` — CRUD signatories (soft-delete)
- `/dashboard/profile` — edit organization profile + upload logo
- `/dashboard/audit` — paginated audit log viewer with case-insensitive search
- `/dashboard/help` — slim panduan link to `docs/PANDUAN.md`

### 4.3 API routes (`src/app/api/`)

All return JSON. All mutation routes require auth via NextAuth session except `/api/setup` (idempotent bootstrap) and `/api/verify/[token]` (public).

| Route | Method | Notes |
|---|---|---|
| `/api/auth/[...nextauth]` | NextAuth | Credentials provider; **rate limited** (10/min/IP) |
| `/api/setup` | POST | Idempotent SUPER_ADMIN bootstrap, Serializable transaction |
| `/api/profile` | GET/PUT | Update org profile metadata |
| `/api/profile/logo` | GET/POST/DELETE | Upload logo bytes (PNG/JPG/SVG/WEBP/GIF ≤2MB). SVG content sanitization on POST. SVG served with strict CSP + sandbox to prevent XSS. **Rate limited** (20/min/user). Supports `If-Modified-Since` 304. |
| `/api/signatories` | GET/POST | List + create |
| `/api/signatories/[id]` | GET/PATCH/DELETE | Soft-delete preserves historical signatures |
| `/api/archives` | GET/POST | Paginated list (case-insensitive search). POST accepts `requiredSignatoryIds: string[]?`. |
| `/api/archives/[id]` | GET/PATCH/DELETE | DELETE refuses 409 if any signatures exist (don't break printed QR tokens) |
| `/api/archives/[id]/sign` | POST | Sign archive on behalf of a signatory. P2002 race catch via partial unique index. **Rate limited** (30/min/user). |
| `/api/archives/[id]/sign/revoke` | POST | Revoke signature with reason |
| `/api/archives/[id]/qr` | GET | PNG QR code with org logo composited in center (error correction `H`) |
| `/api/archives/[id]/stamp` | GET | Full BSrE-style stamp PNG (QR + name + position + unit + institution footer) |
| `/api/archives/[id]/document-hash` | POST | Bind a SHA-256 hash of the source PDF to the archive |
| `/api/archives/[id]/embed-pdf` | POST | Upload PDF ≤10MB, stamp at chosen page/corner via pdf-lib, stream back. **Not stored.** **Rate limited** (10/min/user). |
| `/api/verify/[token]` | GET | Public verification. **Rate limited** (120/min/IP). |

### 4.4 Key libraries (`src/lib/`)

| File | Purpose |
|---|---|
| `signature.ts` | HMAC-SHA256 compute/verify, token generation, `buildVerifyUrl` |
| `archiveSignature.ts` | `pickPrimarySignature`, `deriveArchiveStatus` (single-signer + multi-signer logic) |
| `auth.ts` | NextAuth options, credentials provider, JWT callbacks |
| `audit.ts` | `logAudit` helper (best-effort; never throws to caller) |
| `prisma.ts` | Singleton Prisma client |
| `profile.ts` | `getOrCreateOrganizationProfile` with `React.cache` + findUnique-first optimization |
| `qr.ts` | QR PNG generation + center-logo compositing via sharp |
| `stamp.ts` | Full BSrE-style stamp SVG → PNG composer |
| `stampFont.ts` | Per-glyph font path resolver (Inter Regular + Bold) for SVG `<path>` rendering (anti-tofu) |
| `logoSrc.ts` | Helper to choose between `logoBytes`/`logoUrl` for img src |
| `rateLimit.ts` | Upstash Redis limiters with fail-open semantics, IP + user identifiers |
| `utils.ts` | `cn()` Tailwind class merger |

### 4.5 Components (`src/components/`)

- `AppFooter.tsx` — "Made with love by weverx.com" footer rendered globally via root layout
- `LoadingScreen.tsx` — branded `<LogoMark>` + animated halo for `loading.tsx` boundaries
- `LogoMark.tsx` — sharable logo component used in header, landing page, `/about`, `/verify`, archive detail. Plain `<img>` with graceful fallback to text initials.
- `Providers.tsx` — wraps `SessionProvider` + `Toaster`
- `ui/Badge.tsx`, `ui/Button.tsx`, `ui/Card.tsx`, `ui/Input.tsx` — primitives

### 4.6 Tests (`src/lib/__tests__/`)

50 tests total, ~1s runtime via Vitest:
- `signature.test.ts` (15) — golden HMAC vectors (pinned to detect any payload composition drift)
- `archiveSignature.test.ts` (17) — status matrix lifecycle (DRAFT/PENDING/FULLY_SIGNED/REVOKED across single-signer + multi-signer combinations)
- `rateLimit.test.ts` (16) — limiter semantics, identifier shapes, fail-open behavior
- `stampFont.test.ts` (7) — stamp glyph regression guard (anti-kotak2 — verifies every printable char has a real path, not a `.notdef` rectangle)

Run with `npm test` (CI-style) or `npm run test:watch`.

## 5. Environment variables

See `.env.example` for the full list with inline docs. TL;DR:

| Var | Required? | Used for |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection (Neon Singapore for prod) |
| `NEXTAUTH_URL` | yes | NextAuth callback origin (`https://sign.unigamalang.ac.id` for prod) |
| `NEXTAUTH_SECRET` | yes | NextAuth JWT signing |
| `SIGNATURE_SECRET` | **yes (mandatory)** | HMAC secret for signature integrity. **Must differ from `NEXTAUTH_SECRET`.** Rotating invalidates every existing signature. |
| `NEXT_PUBLIC_APP_URL` | yes | Default QR target when `OrganizationProfile.verifyBaseUrl` not set |
| `UPSTASH_REDIS_REST_URL` | optional | Rate limit storage. Fail-open when missing. **Production should set.** |
| `UPSTASH_REDIS_REST_TOKEN` | optional | Rate limit storage. |
| `SENTRY_DSN` | optional | Server-side Sentry. No-op when missing. |
| `NEXT_PUBLIC_SENTRY_DSN` | optional | Client-side Sentry. No-op when missing. |
| `SENTRY_TRACES_SAMPLE_RATE` | optional | Server sample rate (default 0.1) |
| `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE` | optional | Client sample rate (default 0.05) |
| `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` | optional | Source-map upload at build time |

### Production Vercel env vars (as of this writing)

```
NEXTAUTH_URL                                            [production]
NEXT_PUBLIC_APP_URL                                     [production]
DATABASE_URL                                            [production, preview, development]
SIGNATURE_SECRET                                        [production, preview, development]
NEXTAUTH_SECRET                                         [production, preview, development]
UPSTASH_REDIS_REST_URL                                  [production, preview, development]
UPSTASH_REDIS_REST_TOKEN                                [production, preview, development]
```

**`SENTRY_DSN` is NOT yet set in Vercel** — Sentry code is fully wired but stays no-op until DSN is added.

## 6. Deployment

### 6.1 Vercel production

- **Project**: `prj_YWeCQ9cgArGhawKL7vItrfiaJWhk` (team `team_PUrACGaQIQKW2Ks6lY9dutVn`, slug `weverxcom-9750s-projects`)
- **Framework**: Next.js (default install + build commands)
- **Node version**: 24.x
- **Production branch**: `main`
- **Linked repo**: `weverxcom-hub/digital-signature`
- **Domains**:
  - `sign.unigamalang.ac.id` (verified, primary)
  - `digital-signature-jade.vercel.app` (verified, vercel-default)

Every push/merge to `main` triggers an auto-deploy. Every PR triggers a preview deployment with its own `*-weverxcom-9750s-projects.vercel.app` URL.

### 6.2 Database (Neon)

- Production DB hosted on **Neon, region `ap-southeast-1` (Singapore)**
- Same `DATABASE_URL` is set across all 3 Vercel targets (production/preview/development) — preview deployments share the production DB. **Don't run destructive migrations against preview without testing locally first.**
- Local dev uses plain Postgres on port `55432` (see `.env.example`)

### 6.3 Migrations

Vercel's default install command does `npm install` which triggers `postinstall: prisma generate`. **Migrations are NOT auto-applied on deploy.** To apply:

```bash
# Locally, against the production DB (with DATABASE_URL set):
npx prisma migrate deploy
```

Or check in code review whether a migration was added; if so, run `migrate deploy` against prod immediately after merging.

### 6.4 Cron / scheduled tasks

None.

## 7. Security posture

### Implemented

- **HMAC-SHA256** signature integrity (constant-time compare in `verifySignatureHmac`)
- **bcrypt cost=12** for password hashing
- **Partial unique index** on `(archiveId, signatoryId) WHERE revokedAt IS NULL` — prevents concurrent double-sign race (caught via Prisma P2002)
- **Serializable transaction** on `/api/setup` — prevents concurrent admin creation race
- **HTTPS-only**, HSTS `max-age=31536000; includeSubDomains` on all routes
- **`X-Frame-Options: DENY`** + **`Content-Security-Policy: frame-ancestors 'none'`** on `/verify/*` (trust anchor, never frameable)
- **`X-Frame-Options: SAMEORIGIN`** on dashboard + landing
- **`X-Robots-Tag: noindex, nofollow`** on dashboard
- **`X-Content-Type-Options: nosniff`**, **`Referrer-Policy: strict-origin-when-cross-origin`**, **`Permissions-Policy: camera=(), microphone=(), geolocation=()`** globally
- **Rate limiting** (Upstash Redis, sliding window, fail-open):
  - Login: 10/min/IP
  - Archive sign: 30/min/user
  - PDF embed: 10/min/user
  - Logo upload: 20/min/user
  - Verify API: 120/min/IP
- **SVG hardening on `/api/profile/logo`**:
  - Upload-time: reject `<script>`, `<foreignObject>`, event handlers (`on*=`), `javascript:` URLs, `<!ENTITY>`
  - Serve-time: `Content-Security-Policy: script-src 'none'; sandbox` + `X-Content-Type-Options: nosniff`
- **Archive hard-delete refuses** if any signatures exist (returns 409) — preserves printed QR tokens
- **Audit log** for every mutation

### NOT implemented (intentional / open items)

- **No CSRF tokens beyond NextAuth's defaults** — all mutating routes are guarded by session presence + same-origin; for higher-stakes routes consider adding a CSRF middleware
- **No 2FA / WebAuthn** — single-factor (password) auth only
- **No PDF document storage** — embed-PDF streams the result and discards the original. By design; reconsider if user requirements change.
- **No GitHub Actions CI** — file exists in `docs/ci-workflow-sample.yml`, **needs manual copy to `.github/workflows/test.yml`** via GitHub UI (Devin's PAT lacks `workflow` scope)
- **No source-map upload to Sentry** — `SENTRY_AUTH_TOKEN` not set; errors will show minified stack traces
- **No i18n extraction** — Indonesian + English strings hardcoded throughout (`docs/PANDUAN.md` is Indonesian, code is English)

## 8. Recent activity

Most recent PRs (top = newest):

| PR | Title | Merged | Notes |
|---|---|---|---|
| [#16](https://github.com/weverxcom-hub/digital-signature/pull/16) | Fix `/verify` header rule order | 2026-05-25 | Header rule order: generic before specific, so `X-Frame-Options: DENY` on `/verify/*` wins. CSP `frame-ancestors 'none'` was already enforced. |
| [#15](https://github.com/weverxcom-hub/digital-signature/pull/15) | Add PROJECT_STATUS.md handoff document | 2026-05-25 | This file. |
| [#14](https://github.com/weverxcom-hub/digital-signature/pull/14) | Sentry error tracking (server + edge + client) | 2026-05-24 | No-op until `SENTRY_DSN` env var set. `withSentryConfig` wraps `next.config.mjs`. Replay 5% + 100% on error with `maskAllInputs` + `blockAllMedia`. |
| [#13](https://github.com/weverxcom-hub/digital-signature/pull/13) | Vitest suite (50 tests) + CI workflow sample | 2026-05-24 | 4 test files. CI yaml shipped to `docs/` (needs manual move to `.github/workflows/`). |
| [#12](https://github.com/weverxcom-hub/digital-signature/pull/12) | SVG hardening (CSP + content sanitize) | 2026-05-24 | 2-layer defense on `/api/profile/logo` |
| [#11](https://github.com/weverxcom-hub/digital-signature/pull/11) | Rate-limit auth + heavy routes via Upstash Redis | 2026-05-23 | 5 buckets. Smoke-tested in prod (verify endpoint trips at request 121). |
| [#10](https://github.com/weverxcom-hub/digital-signature/pull/10) | Sync PR for main rebranding (no-op) | 2026-05-23 | Brought `main` up to date with `devin/1778530409-initial-scaffold` (5-day split-brain fix). GitHub default branch + Vercel production branch now both `main`. |
| #9 | QR stamp font rendering + responsive UX pass + audit fixes | 2026-05-22 | Per-glyph SVG path fallback for stamp (extra anti-tofu layer) |
| [#8](https://github.com/weverxcom-hub/digital-signature/pull/8) | Stamp font tofu + QR with org logo + perf | 2026-05-22 | Inter font bundled inline in SVG; QR error-correction `H` + center logo composite; `If-Modified-Since` on logo endpoint |
| [#7](https://github.com/weverxcom-hub/digital-signature/pull/7) | Footer + security headers + race-condition fixes | 2026-05-22 | "Made with love by weverx.com" footer. CSP/HSTS/XFO. P0 race fixes. |
| [#6](https://github.com/weverxcom-hub/digital-signature/pull/6) | Logo file upload + branded loading state | 2026-05-21 | `logoBytes` column. `LogoMark` component. `loading.tsx` boundaries. |
| [#5](https://github.com/weverxcom-hub/digital-signature/pull/5) | Upload PDF + embed BSrE-style signature stamp | 2026-05-21 | `pdf-lib` integration. No storage. |
| [#4](https://github.com/weverxcom-hub/digital-signature/pull/4) | Multi-signer UI with required signers + PENDING status | 2026-05-21 | `ArchiveRequiredSignatory` model. Status enum. |
| [#3](https://github.com/weverxcom-hub/digital-signature/pull/3) | Archive 1:N ArchiveSignature + Archive.status enum | 2026-05-20 | Multi-signature refactor. |
| #2 / #1 | Initial scaffold | 2026-05-12 | First version. |

For the up-to-date list with diffs: https://github.com/weverxcom-hub/digital-signature/pulls?q=is%3Apr+sort%3Aupdated-desc

## 9. Demo repo (digital-signature-demo)

### Status

- `main` HEAD = `506d1888…` (Merge PR #1)
- 100 files copied from main repo with branding normalized:
  - All `UNIGA` / `Universitas Gajayana Malang` → `Acme Foundation` / `ACME`
  - All `unigamalang.ac.id` / `sign.unigamalang.ac.id` → `your-org.example.com`
  - Indonesian-flavored copy kept (international institutions can re-translate)
- README has a one-click **Deploy to Vercel** button with required env vars pre-listed
- All upstream features (rate limit, Sentry, Vitest, SVG hardening, QR logo) forward-ported

### What's missing

- **No Vercel project linked** — anyone who clicks Deploy-to-Vercel will get a fresh project. We could set up a sample demo deployment if helpful.
- **Demo repo not in Devin GitHub App installation** — direct `git push` via the Devin proxy fails 403. Workaround: use GitHub Git Data API (already proven in prior sessions). Long-term: add the repo to the Devin GitHub App.

## 10. Open items / TODO

### User actions

- [ ] **Move `docs/ci-workflow-sample.yml` → `.github/workflows/test.yml`** via the GitHub web UI to enable PR-level CI checks (PAT used by Devin lacks `workflow` scope). Until done, Vercel preview builds are the only CI guard.
- [ ] **(Optional) Set `SENTRY_DSN` + `NEXT_PUBLIC_SENTRY_DSN`** in Vercel env vars to activate error tracking. Create a free Next.js project at https://sentry.io → Settings → Client Keys (DSN). Wire to both Production + Preview targets.
- [ ] **(Optional) Set `SENTRY_AUTH_TOKEN` + `SENTRY_ORG` + `SENTRY_PROJECT`** for symbolicated stack traces (source-map upload).
- [ ] **(Optional) Add `digital-signature-demo` to the Devin GitHub App installation** at https://github.com/settings/installations → Devin AI → Configure → add the demo repo. This unblocks normal `git push` for the demo repo (currently requires REST API workaround).

### Code

- [ ] **Delete legacy `devin/*` branches** once the team is confident no rollback is needed (current branches: `devin/1778530409-initial-scaffold`, `devin/1778720675-multi-signer-ui`, `devin/1778721115-pdf-embed-stamp`, `devin/1778733006-logo-upload-and-loading`, `devin/1778755102-audit-fixes-footer`, `devin/1778771536-stamp-font-qr-logo`, `devin/1778865813-audit-fixes`, `devin/1779628602-svg-hardening`, `devin/1779628723-test-suite`, `devin/1779629193-sentry`)
- [ ] **(Nice-to-have)** Add a `prisma migrate deploy` step to a post-deploy hook (Vercel doesn't run migrations by default). Currently migrations must be applied manually.
- [ ] **(Nice-to-have)** Add a backup strategy for Neon (point-in-time recovery is enabled by default on Neon paid plans).
- [ ] **(Nice-to-have)** Extract hardcoded Indonesian strings to `next-intl` if multi-language is a real requirement.
- [ ] **(Investigate)** Whether `outputFileTracingIncludes` lives under `experimental.*` in Next.js 14 (current code does) vs top-level in Next.js 15 — adjust when bumping Next.

### Devin-specific notes (only relevant if continuing with Devin sessions)

- **GITHUB_PAT_DIGITAL_SIGNATURE** environment var was invalidated after a session env restart on 2026-05-24. Regenerate with **Fine-grained PAT**: Contents `Read & write`, Pull Requests `Read & write`, Metadata `Read-only`. Scope to **both** `digital-signature` and `digital-signature-demo` repos. Save org-level.
- **VERCEL_TOKEN** was also invalidated and regenerated; current token is saved org-level. If it expires again, regenerate at https://vercel.com/account/tokens with SSO authorization for the team.
- **Git proxy** at `git-manager.devin.ai` sometimes returns 403 mid-session. Fallback: use GitHub REST API for push operations (see `/tmp/api-push-generic.py` in prior session; can be regenerated easily by anyone reading the GitHub Git Data API docs).

## 11. Running locally

### One-time setup

```bash
# 1. Clone
git clone https://github.com/weverxcom-hub/digital-signature.git
cd digital-signature

# 2. Install deps (triggers prisma generate via postinstall)
npm install

# 3. Start a local Postgres (Docker)
docker run -d --name dsig-pg \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=digital_signature \
  -p 55432:5432 \
  postgres:16-alpine

# 4. Create .env from .env.example, generate secrets:
cp .env.example .env
# Edit .env and set:
#   NEXTAUTH_SECRET=$(openssl rand -base64 32)
#   SIGNATURE_SECRET=$(openssl rand -base64 32)
# (must be different from each other)

# 5. Run migrations
npx prisma migrate deploy

# 6. Start dev server
npm run dev
# → http://localhost:3000
# → /setup to create the first super-admin
```

### Daily workflow

```bash
npm run dev          # next dev
npm run lint         # next lint (ESLint)
npm run typecheck    # tsc --noEmit
npm test             # vitest run (50 tests)
npm run test:watch   # vitest in watch mode
npm run db:studio    # Prisma Studio (browse DB)
```

Always run `npm run lint && npm run typecheck && npm test` before opening a PR. Vercel preview will catch build failures too.

### Adding a feature

1. Branch from `main`: `git checkout -b feat/your-thing`
2. If schema change: `npx prisma migrate dev --name describe_change` (creates a new migration in `prisma/migrations/`)
3. Code + tests
4. `npm run lint && npm run typecheck && npm test`
5. Push branch + open PR
6. Vercel will build a preview; verify in browser
7. Merge to `main` → auto-deploy to production
8. **If migration added: run `npx prisma migrate deploy` against production DATABASE_URL** immediately after merge
9. Update this file's "Recent activity" + "Latest update" sections in the same PR

## 12. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Stamp shows `□□□□` (tofu) instead of letters | Fonts not bundled into serverless function | Check `next.config.mjs > experimental.outputFileTracingIncludes` includes `./public/fonts/**` for the relevant route |
| QR scans to wrong URL | `verifyBaseUrl` not set in `OrganizationProfile` AND `NEXT_PUBLIC_APP_URL` wrong | Set `OrganizationProfile.verifyBaseUrl` via dashboard → Profile, or fix `NEXT_PUBLIC_APP_URL` env var |
| Signature verification fails after migration | `SIGNATURE_SECRET` was rotated | Don't rotate it; if accidentally rotated, every existing signature is now invalid (no recovery). Restore the old value from your secrets vault. |
| 429 errors on login during legitimate use | Rate limit too tight or a NAT-shared IP | Adjust `DEFS` in `src/lib/rateLimit.ts`. Login is intentionally tight (10/min) — increase only if abuse risk acceptable. |
| Vercel build fails with "Module not found: fonts" | Path tracing didn't pick up font files | Re-check `outputFileTracingIncludes`; consider switching to a literal `fs.readFileSync` import next to the route |
| Migration drift | Local DB and prod DB diverge | `npx prisma migrate status` to compare. Worst case: `prisma migrate resolve --applied <name>` for already-applied migrations, then `migrate deploy`. |

## 13. Handoff checklist for new contributors

- [ ] Read this file end-to-end
- [ ] Clone both repos: `weverxcom-hub/digital-signature` + `weverxcom-hub/digital-signature-demo`
- [ ] Get credentials: Neon DB, Vercel team `weverxcom-9750s-projects`, GitHub org `weverxcom-hub`, Upstash Redis (optional), Sentry (optional)
- [ ] Run the [local setup steps](#111-one-time-setup)
- [ ] Run `npm test` — confirm 50/50 passing
- [ ] Run `npm run dev` and click around: create archive, add signatory, sign, verify
- [ ] Read `docs/PANDUAN.md` for end-user flow (Indonesian)
- [ ] Skim the latest 3 merged PRs for context on recent decisions

## 14. Key files quick-reference

```
prisma/schema.prisma                       # 7 models
prisma/migrations/                         # 7 additive migrations
src/app/                                   # Next.js App Router pages + API
src/lib/signature.ts                       # HMAC engine
src/lib/archiveSignature.ts                # Status derivation
src/lib/rateLimit.ts                       # Upstash limiters
src/lib/stamp.ts + stampFont.ts            # Stamp SVG composition + per-glyph fallback
src/lib/qr.ts                              # QR code with center logo
src/lib/__tests__/                         # 50 Vitest tests
sentry.{server,edge,client}.config.ts      # Sentry runtime init
next.config.mjs                            # Headers + Sentry wrapper
.env.example                               # All env vars documented
docs/PANDUAN.md                            # End-user guide (Indonesian)
docs/ci-workflow-sample.yml                # GitHub Actions CI (needs manual install)
public/fonts/Inter-Regular.ttf, -Bold.ttf  # Bundled fonts for stamp rendering
PROJECT_STATUS.md                          # This file
```

---

**Maintainer note**: Update this doc whenever you ship a behavior change, schema change, env var change, or operational change. It is the single source of truth for project state.
