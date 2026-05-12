# Digital Signature

A self-hostable digital-signature attestation platform with QR-code public
verification. Built for universities, government offices, and any organization
that issues numbered documents and wants a low-cost, trustworthy way to verify
their authenticity.

> This is **not** PKI / BSrE. It is a **signed-attestation pattern**: the
> system stores a tamper-evident record (HMAC-SHA256) that says
> "document _X_ was signed by _person Y_ on _date Z_", and exposes that record
> via a public verification URL on **your own** domain. Anyone can scan the QR
> printed on the document and confirm authenticity against your domain.

📖 **Untuk panduan penggunaan harian (Bahasa Indonesia)**, lihat
[`docs/PANDUAN.md`](docs/PANDUAN.md). Ini sumber resmi panduan — bisa di-edit
langsung di GitHub kapan saja.

## Features

- **Organization profile**: name, short name, tagline, logo URL, primary
  color, verification domain. The whole UI re-brands automatically.
- **Signatory CRUD**: list of people authorized to be named as signers
  (Rector, Dean, Director, …). Soft delete keeps historical signatures intact.
- **Archive CRUD**: create document records (number, subject, issued date,
  description). Admins can edit before signing.
- **One-click sign + revoke**: pick a signatory and sign an archive. The
  signatory's name/position is snapshotted onto the signature so renames don't
  retroactively change history. Super-admin can revoke with a reason.
- **QR-code generation**: PNG / SVG / data-URL endpoints, dropped onto your
  printed or PDF document. Point the QR to your official domain via
  `OrganizationProfile.verifyBaseUrl`.
- **Public verification page** at `/verify/<token>` — no login required.
  Shows ✓ valid / ⚠ tampered / ✗ revoked / not-found, with the org branding.
- **Audit log** of every mutation.
- **HMAC-SHA256 integrity**: even if someone tampers with the database,
  verification will flag the record as tampered (unless they also steal the
  signing secret).

## Tech stack

- **Next.js 14** (App Router) + TypeScript
- **Tailwind CSS** for styling
- **Prisma** + PostgreSQL (Neon, Vercel Postgres, Supabase, or self-hosted)
- **NextAuth** (credentials) + bcrypt for password hashing
- **qrcode** for QR generation

## Getting started

```bash
# 1. Install
npm install

# 2. Start a local Postgres (Docker)
docker run -d --name dsig-pg \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=digital_signature \
  -p 55432:5432 postgres:16-alpine

# 3. Configure env
cp .env.example .env
# generate secrets:
node -e "console.log('NEXTAUTH_SECRET=' + require('crypto').randomBytes(32).toString('base64'))"
node -e "console.log('SIGNATURE_SECRET=' + require('crypto').randomBytes(32).toString('base64'))"
# paste them into .env

# 4. Run migrations
npx prisma migrate deploy

# 5. Start dev server
npm run dev
```

Then open <http://localhost:3000>. On first visit you'll be redirected to
`/setup` to create the first admin and name the organization.

## Configuration

| Env var                  | Required | Notes                                                                       |
| ------------------------ | -------- | --------------------------------------------------------------------------- |
| `DATABASE_URL`           | yes      | PostgreSQL connection string (`postgresql://user:pass@host/db?sslmode=require`). |
| `NEXTAUTH_URL`           | yes      | The URL where this app is hosted (e.g. `https://signatures.example.ac.id`). |
| `NEXTAUTH_SECRET`        | yes      | Generate with `openssl rand -base64 32`.                                    |
| `SIGNATURE_SECRET`       | no       | Used to HMAC-sign attestations. Falls back to `NEXTAUTH_SECRET` if unset.   |
| `NEXT_PUBLIC_APP_URL`    | yes      | Public URL of this app. Used as the default QR target.                      |

Most branding (logo URL, primary color, verification domain) is configured
**from the dashboard** at `/dashboard/profile`, not via env vars.

### Verification domain (the most important setting)

Set `OrganizationProfile.verifyBaseUrl` (in the dashboard) to your **official
organization domain**, e.g. `https://unigamalang.ac.id`. QR codes will be
generated as `https://unigamalang.ac.id/verify/<token>`.

That route then needs to point at this app — typically via:

1. Hosting this app on a subdomain of the official domain
   (e.g. `verify.unigamalang.ac.id`) and using `verifyBaseUrl =
   https://verify.unigamalang.ac.id`. **Simplest.**
2. Reverse-proxying `unigamalang.ac.id/verify/*` to this app's deployment.
3. Or hosting the app directly at the root domain.

Whichever you choose: the trust of the system rests on the QR code resolving
to **your domain**, so visitors can verify by looking at the URL bar.

## Deployment

### Vercel (easiest)

1. Push to GitHub.
2. Import the repo in Vercel.
3. Add the env vars from `.env.example` (use a managed Postgres for
   `DATABASE_URL` — Neon, Vercel Postgres, or Supabase). For Neon, use the
   **pooled** connection string.
4. The `vercel.json` already pins the build command to
   `prisma generate && prisma migrate deploy && next build`.
5. Set up your domain.

### Self-hosted (Docker / VPS)

```bash
npm ci
npx prisma migrate deploy
npm run build
npm run start
```

Put this behind nginx or another reverse proxy with TLS.

## Roles

| Role          | Can…                                                                        |
| ------------- | --------------------------------------------------------------------------- |
| `SUPER_ADMIN` | Everything, including revoking signatures and managing org profile.         |
| `ADMIN`       | Manage signatories, sign archives, edit profile.                            |
| `USER`        | Create / view archives (no signing power yet).                              |

The first user created via `/setup` is `SUPER_ADMIN`.

## API surface

| Method | Path                                  | Auth                  | Notes                          |
| ------ | ------------------------------------- | --------------------- | ------------------------------ |
| GET    | `/api/setup`                          | public                | Returns `{ needsSetup }`.      |
| POST   | `/api/setup`                          | public (one-shot)     | Creates first super-admin.     |
| GET    | `/api/profile`                        | session               | Org profile.                   |
| PATCH  | `/api/profile`                        | admin                 | Update org profile.            |
| GET    | `/api/signatories`                    | session               | List signatories.              |
| POST   | `/api/signatories`                    | admin                 | Create signatory.              |
| PATCH  | `/api/signatories/[id]`               | admin                 | Update.                        |
| DELETE | `/api/signatories/[id]`               | admin                 | Soft delete.                   |
| GET    | `/api/archives`                       | session               | List archives.                 |
| POST   | `/api/archives`                       | session               | Create archive.                |
| GET    | `/api/archives/[id]`                  | session               | Detail.                        |
| PATCH  | `/api/archives/[id]`                  | session               | Edit (only if unsigned).       |
| DELETE | `/api/archives/[id]`                  | admin                 | Delete (cascades signature).   |
| POST   | `/api/archives/[id]/sign`             | admin                 | `{ signatoryId }`.             |
| POST   | `/api/archives/[id]/sign/revoke`      | super-admin           | `{ reason }`.                  |
| GET    | `/api/archives/[id]/qr`               | session               | `?format=png\|svg\|dataurl`.   |
| GET    | `/api/verify/[token]`                 | **public**            | JSON verification.             |
| GET    | `/verify/[token]`                     | **public**            | Branded HTML verification.     |

## Roadmap

Out-of-scope for this v1, easy to add later:

- File upload for logo and signatory specimen images
- Multi-signer (one document, many signatures)
- BSrE / PKI x.509 integration
- OTP confirmation before signing
- Webhooks for `archive.signed` / `archive.sign_revoked`
- PDF export with embedded QR

## License

MIT — see [LICENSE](./LICENSE).
