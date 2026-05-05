# helios-dashboards

Internal tool: per-client AI-updated project dashboards for Helios Marketing.
See `PLAN.md` for the full engineering plan.

## Setup

1. `cp .env.local.example .env.local` and fill in values.
2. `npm install`
3. `npx prisma db push` (dev) or `npx prisma migrate dev` (post-first-migration)
4. `npx prisma db seed`
5. `npm run dev`

Routes:
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
