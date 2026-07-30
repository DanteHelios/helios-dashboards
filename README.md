# helios-dashboards

Internal tool built for Helios Marketing: a per-client project dashboard that keeps clients updated on their project's progress without requiring manual status updates from the team.

## What it's for

Helios manages ongoing projects for multiple clients. Instead of manually writing and sending status updates, each client gets a private, tokenized dashboard link (`/d/[token]`) showing their project's current status — automatically kept up to date.

## What it does

- **Client dashboards** — each client has a unique dashboard URL, showing live project status without needing a login.
- **Automated updates** — scheduled jobs pull in the latest project activity and use AI to generate a plain-language summary of progress, so clients get a readable update without anyone on the team writing it by hand.
- **Admin panel** — an internal `/admin` view (restricted to `@heliosmarketing.org` accounts via Clerk) for managing clients and dashboards.
- **File/asset handling** — supports uploading and serving project-related files (e.g. deck PDFs) to clients via Vercel Blob.

## How it's built

- **Framework:** Next.js 15 (TypeScript), Tailwind CSS
- **Database:** Postgres via Prisma ORM
- **Auth:** Clerk (admin-only, restricted by email domain)
- **File storage:** Vercel Blob
- **AI:** Anthropic API, used to turn raw project activity into client-readable summaries
- **Scheduling:** Vercel cron jobs (see `vercel.json`) trigger the sync and AI-generation routes on a schedule
- **Deployment:** Vercel, auto-deployed from `main`

See `docs/PLAN.md` for the full engineering plan.

## Setup

1. `cp .env.local.example .env.local` and fill in values.
2. `npm install`
3. `npx prisma db push` (dev) or `npx prisma migrate dev` (post-first-migration)
4. `npx prisma db seed`
5. `npm run dev`

## Routes

- `/d/[token]` — client dashboard (use the seeded token to test)
- `/admin` — admin (Clerk login required, `@heliosmarketing.org` only)

## Common tasks

```bash
# Reset DB and reseed
npx prisma db push --force-reset && npx prisma db seed

# Open Prisma Studio
npx prisma studio

# Trigger sync cron locally
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/sync-github

# Trigger AI generation locally
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/generate-updates
```

## Deployment

Pushing to `main` deploys to Vercel automatically. Cron jobs are configured in `vercel.json`.
