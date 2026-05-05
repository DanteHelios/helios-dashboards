# Helios Client Dashboards — Engineering Plan

**Status:** Final (v3.1 — incorporates Lucas's answers; ready for Claude Code)
**Owner:** [you]
**Reviewer:** Lucas
**Last updated:** 2026-05-05

**Lucas's confirmed decisions (2026-05-05):**
- Repos are scattered across team @heliosmarketing.org GitHub accounts → admin pastes the repo URL per project; we use a service-account collaborator model (§4, §6.3).
- Project completion: manually marked.
- Update cadence: daily.
- History view: last 60 days only.
- "About this project": pulled from the uploaded deck, not the README. README stays as AI input only (not rendered to the client).

---

## 1. TL;DR

Each Helios client gets a private, AI-updated dashboard at a long-token URL (`/d/{token}`). Each project maps **1:1 to a GitHub repo** — the repo is the source of truth for project activity. The dashboard shows: the project's pitch deck (which serves as the "About this project" canonical reference), a timestamped feed of AI-generated context updates (last 60 days), and a countdown to the project completion date. An admin page lets the Helios team create projects, paste a repo URL per project, upload decks, and see/copy each dashboard URL.

AI updates are generated daily by a cron job that pulls new commits, merged PRs, and closed issues from the repo, sends them to Claude with a strict citation prompt, and appends a `ContextUpdate` row.

Build order is dashboard-first (so Lucas sees the product on day one), then DB, then admin/auth, then GitHub ingestion, then the AI loop. Auth and admin are not Phase 1.

The dashboard is styled in the existing Helios design system — same fonts, colors, motion — so it reads as a Helios product, not a generic SaaS internal tool.

---

## 2. Why GitHub-only (architectural rationale)

The earlier plan ingested both meeting transcripts and commits. Cutting transcripts is not a feature loss — it's a sharpening of the model:

- **One source = one schema.** The data model collapses, the cron flow collapses, the ingestion code shrinks. One less thing to break.
- **Richer than just commits.** A repo gives commits *and* PR descriptions (the "why"), issues (the "what's blocked"), and the README (the "what is this project"). The earlier plan treated GitHub as a thin commit feed; the new plan treats it as the structured surface it actually is.
- **Claude Code is part of the workflow.** When the team uses Claude Code, the commit messages it produces are unusually descriptive — often the rationale lives directly in the commit body. The signal-to-noise of the repo is high enough that meetings become redundant.
- **No Google Cloud setup.** The single most painful infra step (service accounts, Drive sharing, OAuth-less folder access) disappears. Total estimate drops by ~1 day.
- **No external blocker.** The original plan had Phase 6 blocked on Lucas confirming a Drive folder. That dependency is gone.

**The cost:** every project must have a repo. Content-only and marketing-only projects need to live in a docs-only repo (campaign briefs, asset checklists, creative direction — all in markdown). This is a discipline cost, not a technical one, and it has a side benefit: every project ends up with a versioned, auditable record of decisions.

**The bet:** that PRs and READMEs carry enough narrative context to replace meetings. If the team writes good PR descriptions, this is true. If PR titles are "fix stuff" and bodies are empty, the AI will produce dry changelog-style updates. Mitigation: enforce a PR-description template once we ship.

---

## 3. Key changes from the v1 draft (the user's original)

| # | Change | Why |
|---|---|---|
| 1 | **Phase 1 = client dashboard with hardcoded data**, not auth + admin shell. | Auth-first means a day of Clerk yak-shaving with nothing to show. Dashboard-first = a screenshot to Lucas EOD day 1, which is what gets buy-in. |
| 2 | **Use the Helios design system end-to-end.** | The brand kit is a goldmine — tokens, fonts, components already exist. Free quality jump. |
| 3 | **Drop transcripts entirely.** | See §2. |
| 4 | **Unify Commit/PR/Issue into one `RepoEvent` table** with a `type` discriminator. | One ingestion path, one cron, one chronological feed for the AI prompt. Less code, less to maintain. |
| 5 | **`Project.githubRepo` is required, not nullable.** | GitHub is the spine. No repo, no project. |
| 6 | **Add `Project.readmeMarkdown` and `Project.readmeFetchedAt` (AI input only).** | Gives the AI background context on what the project IS. Per Lucas, **not** rendered on the dashboard — the deck is the canonical "About this project." |
| 7 | **Drop `ProjectMember` and `User.role`.** | YAGNI — nothing in v1 displays members; only one role exists. |
| 8 | **Add `Project.startDate`, `targetEndDate`, `status`.** | Required for "days until complete." Missed in v1. |
| 9 | **AI updates carry source citations.** | Every bullet must reference the `RepoEvent` IDs it came from. Without this, hallucinated "progress" is a liability. |
| 10 | **AI cron is idempotent and skips empty windows.** | Don't generate two updates for the same events; don't generate filler bullets when nothing happened. |
| 11 | **GitHub: poll on schedule for v1, plan webhooks for v1.5.** | At 12 projects × 1 sync/30 min = 576 calls/day, well under the 5000/hr Octokit limit. |
| 12 | **Magic link drops out of v1.** | Boss said "magic link OR long URL." Long URL is half the work. |
| 13 | **Token rotation must exist from v1.** | If a URL leaks, admin must be able to invalidate. |
| 14 | **Filter junk commits from the dashboard.** | Clients shouldn't see "WIP", "fixup!", "Merge branch". Strip in the read path. |

---

## 4. Tech stack (decided)

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 15 (App Router) + TypeScript | Matches the Helios marketing-site repo. |
| Styling | Tailwind v3 + the existing `colors_and_type.css` tokens | Tokens already written. |
| Fonts | Pragmatica Extended Bold (bundled OTF) + Roboto (Google Fonts) | Per the design system. |
| DB | Postgres (Neon, free tier) | Serverless, fits Vercel. |
| ORM | Prisma | Faster to iterate than Drizzle for this size. |
| Hosting | Vercel | Free tier covers everything. |
| File storage | Vercel Blob | For deck PDFs. |
| Cron | Vercel Cron | Two scheduled jobs. **See §6.3 caveat re: plan tier.** |
| Auth (admin) | Clerk, restricted to `@heliosmarketing.org` Google sign-in | Faster than Auth.js. |
| GitHub | `@octokit/rest` + classic PAT on a service account that's invited as a collaborator on each project repo (v1); GitHub App (v1.5) | Repos are scattered across team accounts — single org-scoped PAT won't work. See §6.3. |
| AI | `@anthropic-ai/sdk`, model `claude-sonnet-4-5` | Brand-voice quality matters. |
| Errors | Sentry (free tier) | Cron failures must surface. |
| Rate limiting | `@upstash/ratelimit` + Upstash Redis (free tier) | For the public dashboard route. |
| PDF render | `<iframe src="{pdfUrl}#toolbar=0">` | No need for `react-pdf`. |
| Markdown render | `react-markdown` + `remark-gfm` + `rehype-sanitize` | Sanitize is non-negotiable since READMEs are user content. |
| Combobox (admin) | Radix Combobox or Headless UI | For client create-or-pick. |
| Date math | `date-fns` | `differenceInCalendarDays`, formatters. |

**No** — to: Drizzle, R2, Auth.js, react-pdf, custom design tokens, Tailwind UI components that don't match the brand, magic-link infra, multi-role auth, email sending, Google Cloud anything, transcript ingestion of any kind, dark mode, automated tests beyond the AI validation function, analytics.

---

## 5. Data model

```prisma
// schema.prisma

model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String?
  createdAt DateTime @default(now())
  // No role field. Everyone with @heliosmarketing.org is admin in v1.
}

model Client {
  id           String    @id @default(cuid())
  name         String
  contactEmail String?
  createdAt    DateTime  @default(now())
  projects     Project[]
}

model Project {
  id                  String        @id @default(cuid())
  clientId            String
  client              Client        @relation(fields: [clientId], references: [id])
  name                String
  status              ProjectStatus @default(ACTIVE)

  // Timeline (stored UTC; rendered with date-fns)
  startDate           DateTime
  targetEndDate       DateTime
  completedAt         DateTime?

  // Access
  accessToken         String        @unique // 32 random bytes, base64url. Rotatable.

  // GitHub (required)
  githubRepo          String        // "owner/repo"
  githubBranch        String        @default("main")
  githubLastSyncAt    DateTime?
  readmeMarkdown      String?       @db.Text
  readmeFetchedAt     DateTime?

  // Deck (optional)
  deckPdfUrl          String?

  createdAt           DateTime      @default(now())
  updatedAt           DateTime      @updatedAt

  events              RepoEvent[]
  contextUpdates      ContextUpdate[]

  @@index([accessToken])
}

enum ProjectStatus {
  ACTIVE
  PAUSED
  COMPLETE
  ARCHIVED
}

model RepoEvent {
  id          String        @id @default(cuid())
  projectId   String
  project     Project       @relation(fields: [projectId], references: [id], onDelete: Cascade)

  type        RepoEventType
  externalId  String        // SHA for commits, "123" for PRs/issues
  title       String        @db.Text
  body        String?       @db.Text
  authorName  String
  authorLogin String?
  authorAvatarUrl String?
  url         String
  occurredAt  DateTime
  meta        Json?         // type-specific extras
  fetchedAt   DateTime      @default(now())

  @@unique([projectId, type, externalId])
  @@index([projectId, occurredAt(sort: Desc)])
  @@index([projectId, type, occurredAt])
}

enum RepoEventType {
  COMMIT
  PR_MERGED
  ISSUE_CLOSED
  RELEASE  // v1.5 maybe
}

model ContextUpdate {
  id          String    @id @default(cuid())
  projectId   String
  project     Project   @relation(fields: [projectId], references: [id], onDelete: Cascade)
  bullets     Json      // typed as ContextUpdateBullets — see lib/types.ts
  windowStart DateTime
  windowEnd   DateTime
  generatedAt DateTime  @default(now())
  generatedBy GenSource @default(CRON)

  @@index([projectId, generatedAt(sort: Desc)])
}

enum GenSource {
  CRON
  MANUAL
}
```

**Notes:**
- `accessToken` = `crypto.randomBytes(32).toString('base64url')`. URL-safe, 256 bits of entropy.
- `RepoEvent.meta` JSON shape is type-discriminated — see `lib/types.ts` (Appendix C).
- We track `ISSUE_CLOSED` (signal of completed work) but **not** `ISSUE_OPENED` — the latter is too noisy.
- `ContextUpdate.bullets` is JSON. Bullets are write-once, no per-bullet queries — denormalized on purpose.
- `windowStart` / `windowEnd` enable idempotency. The cron picks up where the last update left off.
- `Cascade` deletes intentional. Delete a project, lose all derived data.
- **Dedup edge case:** a squash-merged PR appears both as a commit on the default branch AND as a PR_MERGED event. The `meta.mergedSha` on PR_MERGED tells us the SHA, but we don't filter — we let the AI prompt's "group related events into a single bullet" instruction handle it. Cleaner than write-time dedup.

---

## 6. Architecture — key flows

### 6.1 Dashboard read (`GET /d/[token]`)
1. Look up project by `accessToken`. 404 if missing.
2. **Status check:**
   - `ACTIVE` → render normally.
   - `PAUSED` → render with a top banner: "This project is currently paused. The next update will appear when work resumes."
   - `COMPLETE` → banner: "This project completed on {completedAt}. Final summary below."
   - `ARCHIVED` → 410 Gone with a generic page.
3. Fetch in parallel: project + client, latest 1 `ContextUpdate`, prior `ContextUpdate`s where `generatedAt > now() - 60 days` for the history feed (per Lucas), recent `RepoEvent`s (last 14 days, junk-filtered).
4. Compute `daysRemaining = differenceInCalendarDays(targetEndDate, today)` in UTC.
5. Render server component. Minimal client JS (history accordion only).
6. Set `<meta name="robots" content="noindex,nofollow">`.
7. Per-IP rate limit: 60 req/min via Upstash.
8. Page-level Next.js settings: `export const dynamic = 'force-dynamic'` (always fresh), `export const revalidate = 0`.

### 6.2 Admin (`/admin/...`, behind Clerk)
- `/admin` → projects table with copy-URL button, days-remaining, last-update-at, last-sync-at.
- `/admin/projects/new` → create form.
- `/admin/projects/[id]` → edit form, deck drop-zone, "regenerate token", "generate update now", "force GitHub resync", recent-events log.
- All admin pages set `<meta name="robots" content="noindex,nofollow">`.
- Server actions revalidate the relevant paths after mutations.

### 6.3 GitHub ingestion (cron, default every 30 min)

**Auth model — service account collaborator pattern:**
Repos are scattered across team @heliosmarketing.org GitHub accounts (per Lucas), so a single org-scoped fine-grained PAT won't work. Instead:

1. Create a dedicated GitHub account: `helios-dashboards-bot` (use a `dashboards@heliosmarketing.org` alias if available, otherwise any controlled inbox). Enable 2FA.
2. Generate a **classic PAT** with `repo` scope (read-only on private repos requires `repo`; there's no narrower classic scope) on that account.
3. **Onboarding step for every new project:** the repo owner invites `helios-dashboards-bot` as a collaborator with **Read** permission. The bot accepts the invite. Document this in the admin UI ("Invite `@helios-dashboards-bot` to the repo as a Read collaborator before creating this project").
4. The PAT lives in `GITHUB_TOKEN`. Rotate every 90 days.
5. Admin form accepts either `owner/repo` or a full GitHub URL (`https://github.com/owner/repo`) — parse to `owner/repo` server-side.

**Why not GitHub App for v1:** an App is the cleaner long-term answer (per-repo install, no collaborator dance, fine-grained perms) but it's ~½–1 day of extra work for v1.5. The collaborator pattern ships today.

**Vercel Cron tier caveat:** verify your current Vercel plan supports sub-daily cron. If only daily is available on your tier, fall back to hourly via Vercel Cron (likely supported) or run sync via GitHub Actions on a `schedule:` workflow that hits `/api/cron/sync-github` with the bearer token. The AI generation cron (`0 7 * * *`) is supported on every tier.

**Per-project sync flow:**
For each `ACTIVE` project with `githubRepo`:
1. Fetch commits on default branch since `githubLastSyncAt` (Octokit `repos.listCommits` with `since`).
2. Fetch PRs merged since `githubLastSyncAt` (`pulls.list` with `state: closed`, filter `merged_at > since`).
3. Fetch issues closed since `githubLastSyncAt` (`issues.list` with `state: closed`, filter `closed_at > since`, **exclude items where `pull_request` is set** — Octokit returns PRs in this list by default).
4. Filter junk commits (§6.5).
5. Upsert into `RepoEvent` with the right `type`. Use `@@unique([projectId, type, externalId])` for idempotency.
6. If README fetched > 24h ago, refetch (`repos.getReadme`) and update `Project.readmeMarkdown`.
7. Set `githubLastSyncAt = now()`.

**Per-project errors don't fail the job** — log to Sentry with `projectId` tag, continue. If a repo is renamed/deleted, the API returns 404; just log and let admin notice via stale `lastSyncAt`. Don't auto-pause.

### 6.4 AI context update generation (cron daily 7am UTC)
For each `ACTIVE` project:
1. `windowStart` = `latestContextUpdate.windowEnd` (or `project.startDate` if first run).
2. `windowEnd` = `now()`.
3. Gather `RepoEvent`s with `occurredAt ∈ [windowStart, windowEnd)`.
4. **If empty → skip. Do not write a row.**
5. Build prompt (Appendix A). Call Claude. Parse strict JSON.
6. Validate every bullet's `sources[].eventId` exists in the input set. Drop bullets with bad citations.
7. If at least 1 valid bullet survives → insert `ContextUpdate`.
8. Sentry on any exception, with `projectId` tag.

### 6.5 Junk commit filter
Drop commits where the message subject matches:
```
/^(merge|wip|fixup!|squashed|revert "merge|chore: bump version|update readme$|^\.+$)/i
```
or is fewer than 5 characters. Apply in the read path **and** in the AI prompt input.

### 6.6 Manual update generation (admin button)
Same code path as 6.4 but `generatedBy = MANUAL`. Synchronous: button shows spinner, route runs the generation (10–30s), responds with the new `ContextUpdate` or 204 if window was empty. Toast on completion. (If we ever hit Vercel's 60s function timeout, switch to async with a job queue — not v1.)

### 6.7 Project creation backfill
When admin creates a project:
1. Validate the GitHub repo exists & is accessible: Octokit `repos.get({owner, repo})`. Surface a clear error if not.
2. Save the row.
3. Run an immediate one-shot ingestion: pull events from `startDate` to `now()`, fetch README.
4. **Do not** auto-generate an AI update — admin clicks "Generate update now" when ready. This puts the human in control of "the dashboard goes live."

---

## 7. Phasing

Each phase ends with a thing Lucas can look at.

### Phase 0 — Foundation (≤ ½ day)
**Goal:** clean Next.js app deployed to Vercel with Helios design tokens.
- `create-next-app` with TS + Tailwind + App Router.
- Copy `colors_and_type.css` from the design zip → `styles/colors_and_type.css`.
- Copy `PragmaticaExtended-Bold.otf` from the design zip → `public/fonts/`.
- Copy `Helios-logo.png` and `favicon.png` from the design zip → `public/`.
- Set up `app/globals.css`, `tailwind.config.ts`, `next.config.ts` per Appendix B.
- Set up `app/layout.tsx` with the Roboto Google Fonts link and the favicon.
- `prisma init`, point at Neon.
- Sentry SDK installed but not yet wired.
- `.env.local.example` with all variables from Appendix D.
- Project `README.md` per Appendix E.
- `.gitignore` includes `.env.local`, `node_modules`, `.next`, `.vercel`, `*.log`, `.DS_Store`.
- Deployed at `*.vercel.app`.

**Done when:** the deploy URL renders a Helios-branded blank page with Pragmatica Extended on a heading and an orange button that has the `0 0 40px -10px #FF5E1A` glow.

### Phase 1 — Client dashboard, hardcoded (1 day)
**Goal:** beautiful dashboard for one fake project, no DB.
- Route `/d/[token]/page.tsx` reads from a TS object whose **shape matches the future Prisma model** (so the swap in Phase 2 is one line).
- Layout (top to bottom):
  1. **Top bar:** Helios wordmark left · project name center · `DAY 14 OF 60` chip right (orange pill, eyebrow style).
  2. **Latest update card:** green eyebrow `LATEST UPDATE`, timestamp, 4 bullets with source-link chips (`commit a3f9c2`, `PR #47`).
  3. **About this project (the deck):** heading + iframe to `Helios Deck.pdf` from the design zip (drop into `public/` for now). Per Lucas, the deck IS the "About this project" — no separate README panel.
  4. **Update history:** prior context updates (last 60 days), collapsed by date, expand to read.
  5. **Recent activity:** last 14 days of repo events, mini-list with type icon (lucide `git-commit` / `git-pull-request` / `circle-check`), title, author with avatar, time-ago.
  6. **Footer:** "Questions? lucas@heliosmarketing.org".
- Match the brand: white canvas, `--neutral-50` alt sections, Pragmatica headings, Roboto Light body, scroll-reveal motion (`opacity 0→1, y 20→0`, 600ms, stagger `idx*0.1s`).
- `<meta name="robots" content="noindex,nofollow">` in the page metadata.
- Mobile responsive.

**Done when:** screenshot to Lucas, he says "yes, build that."

### Phase 2 — DB + project read (½ day)
**Goal:** dashboard reads from real DB instead of hardcoded data.
- Run Prisma migrations (`prisma db push` for dev; switch to `prisma migrate dev` after first real data exists).
- Seed script per Appendix F.
- Replace hardcoded TS object with a Prisma query.
- 404 page for unknown tokens (`app/d/[token]/not-found.tsx`).
- Per-IP rate limit on `/d/[token]` via Upstash.
- Add status banner logic per §6.1.

**Done when:** changing a row in `prisma studio` changes what the dashboard shows.

### Phase 3 — Admin + auth (1 day)
**Goal:** Lucas can self-serve creating projects.
- Clerk integration. Restrict sign-in via `middleware.ts` → check `sessionClaims.email` ends in `@heliosmarketing.org`, redirect to a 403 page otherwise.
- `/admin` projects table (server component).
- `/admin/projects/new` and `/admin/projects/[id]` forms (client components for interactivity).
- Form fields: name, client (Combobox: type to filter existing, "Add new client: {input}" item at bottom), `githubRepo` (validated as `owner/repo`), `githubBranch` (default `main`), start/end dates, status.
- "Regenerate token" button with confirmation modal.
- "Copy dashboard URL" button.
- Server action validates that the GitHub repo exists & is accessible via `Octokit.repos.get` before saving — return a clear error message if not.

**Done when:** Lucas logs in with Google, creates a project, copies the URL, opens it in incognito, sees the dashboard.

### Phase 4 — Deck upload (½ day)
**Goal:** drag-drop a PDF on the admin edit page; it shows up on the dashboard.
- Add `@vercel/blob` + a server action that accepts a PDF (max 25MB, validate MIME), uploads to Blob, writes URL to `Project.deckPdfUrl`.
- Drop-zone component in admin edit form. Replace existing PDF on re-upload.
- Render in dashboard via iframe with `#toolbar=0&navpanes=0`.
- The deck IS the "About this project" panel (per Lucas) — empty state on dashboard if no deck: muted "About this project — coming soon. Reach out to your project lead in the meantime." Admin sees a yellow warning on the project list ("⚠ No deck uploaded") since this is now critical, not decorative.
- Add `*.public.blob.vercel-storage.com` to `next.config.ts` `images.remotePatterns`.

**Done when:** Lucas uploads a deck through the admin and it renders on the client dashboard.

### Phase 5 — GitHub ingestion (1 day)
**Goal:** the dashboard reflects what's actually happening in the repo.
- `GITHUB_TOKEN` env var: classic PAT on the `helios-dashboards-bot` GitHub account, scope `repo` (read access via collaborator invite, see §6.3).
- `lib/github.ts` exports: `fetchCommits(repo, branch, since)`, `fetchMergedPRs(repo, since)`, `fetchClosedIssues(repo, since)`, `fetchReadme(repo, branch)`, `validateRepoAccess(repo)`, `isJunkCommit(message)`, `parseRepoInput(input)` (accepts `owner/repo` or full URL, returns `{owner, repo}`).
- Cron route `/api/cron/sync-github`, secured by `Authorization: Bearer ${CRON_SECRET}` header check, runs on schedule per `vercel.json`.
- Ingestion logic per §6.3.
- Backfill on project creation per §6.7 — call from the create server action. Wrap in try/catch — if backfill fails (e.g., bot not yet invited to the repo), the project still saves and admin can hit "Force resync" later.
- "Force resync" button in admin → `POST /api/admin/projects/[id]/sync` → calls the same per-project sync function.
- Repo URL field in admin accepts either format, parsed via `parseRepoInput`. Surface helpful errors: "Repo not found" vs "Bot not invited as collaborator — invite `@helios-dashboards-bot` and try again."
- Fetch README to populate `Project.readmeMarkdown` on every sync (used as **AI input only**, not rendered to the client).
- Add `avatars.githubusercontent.com` to `next.config.ts` `images.remotePatterns`.

**Done when:** within 30 minutes of pushing a real commit to a real Helios repo, that commit appears in the dashboard's recent activity, with the author's GitHub avatar.

### Phase 6 — AI context updates (1–1.5 days)
**Goal:** the dashboard updates itself.
- `lib/ai.ts` — Claude wrapper with: prompt builder, `generateUpdate(projectId)` function, JSON parsing with one retry, citation validation per Appendix A.
- Cron route `/api/cron/generate-updates`, secured by `CRON_SECRET`, runs daily at 7am UTC per `vercel.json`.
- Per §6.4: idempotent, empty-window-skip, citation validation.
- "Generate update now" button in admin → `POST /api/admin/projects/[id]/generate` → calls `generateUpdate(projectId, { manual: true })`. Synchronous response with new update or 204 if empty window. Button shows spinner.
- Wire up Sentry for cron failures with project ID in the tag.
- **The one piece of testing in this project:** a unit test for the validation function in `lib/ai.ts` — given a mock Claude response with bad citations, ensure those bullets get dropped. Use `vitest`, one test file, no further test infra.

**Done when:** Lucas sees a real, well-written, source-cited update appear on a project dashboard the next morning.

### Phase 7 — Polish (½–1 day, ad hoc)
- **Empty states** (enumerated):
  - Dashboard, no AI updates yet: green eyebrow `WELCOME` + "Updates will appear here after our first review cycle. Check back tomorrow."
  - Dashboard, no recent activity: muted "No recent activity in the project repo."
  - Dashboard, no deck uploaded yet: muted "About this project — coming soon. Reach out to your project lead in the meantime."
  - Admin, 0 projects: prominent "+ Create your first project" CTA.
- **Loading states:** `app/d/[token]/loading.tsx` skeleton; `app/admin/loading.tsx` skeleton; spinner on "Generate update now".
- **Mobile pass:** top bar collapses, deck embed is responsive (or shows a "Open deck" link on mobile if the iframe UX is bad), history accordion works on touch.
- **Sentry alerts wired:** Slack integration on the Sentry side; daily heartbeat (a `console.log("cron heartbeat", {projectId, eventCount})` in each cron loop, picked up via Vercel logs).
- **Custom domain** at Vercel: `dashboards.heliosmarketing.org`. Add to Clerk's allowed origins.
- **`public/robots.txt`** disallowing `/d/` and `/admin/`.
- **Magic-link upgrade** — only if Lucas asks.

**Total estimate:** ~5–6 working days for one engineer. Add 30% for unknowns → **~7–8 days, or 1.5–2 calendar weeks part-time.**

---

## 8. Questions resolved + still open

**Resolved (Lucas, 2026-05-05):**
1. ✅ **Repo location** — scattered across team @heliosmarketing.org GitHub accounts. Admin pastes the repo URL per project. Service-account collaborator pattern (§6.3).
4. ✅ **Project completion** — manually marked.
5. ✅ **Update cadence** — daily.
6. ✅ **History view** — last 60 days only.
8. ✅ **README** — not rendered to clients. The deck is the canonical "About this project." README stays as AI input only.

**Still open (proceeding with defaults; surface to Lucas later):**
2. **Default branch** — assuming `main` per-project with override field. If any project repo uses `master` / `develop`, admin can set it on creation.
3. **Junk commit filter** — going with the regex in §6.5. If the team writes substantive commits that match the pattern, we'll loosen it after Phase 5 ships.
7. **Issues visibility on the dashboard** — defaulting to "AI input only, not rendered to clients" since issue titles can leak internal language.
9. **Content-only projects must use a docs-only repo** — workflow constraint Lucas should socialize with the team. Surface again before Phase 5 lands.

---

## 9. Risks

| Risk | Mitigation |
|---|---|
| AI generates inaccurate bullets, client sees them. | Strict citation requirement + drop uncited bullets. Optional admin review before client sees — *Lucas decides; defaults to autopublish given his "fully AI generated" answer.* |
| Long-token URL leaks. | Token rotation button from Phase 3. |
| GitHub PAT compromise. | Classic PAT lives on dedicated `helios-dashboards-bot` account; rotate quarterly. Migrate to GitHub App in v1.5. |
| Bot not invited to a new repo → backfill fails silently. | Backfill error surfaces in admin UI ("Bot not invited as collaborator — invite `@helios-dashboards-bot`"). "Force resync" retries cleanly. |
| Repo content includes trade secrets / NDAs. | Repo content goes to the Anthropic API. Note in client agreement. Use a private Anthropic workspace if Helios has a paid plan. |
| Cron silently fails. | Sentry from Phase 6 onward. Heartbeat logging in each cron iteration. |
| Octokit rate limits. | At 12 projects × 1 sync / 30 min = 576/day, well under the 5000 req/hr PAT limit. |
| Issue/PR titles leak internal language. | Default: don't render issues on the dashboard, only feed to AI. |
| Empty repo on day 1. | First "Generate update now" no-ops with a clear admin toast. |
| PR descriptions are sparse → AI updates are dry. | Enforce a PR-description template once we ship; communicate to the team. |
| Vercel free tier limits sub-daily cron. | Fall back to GitHub Actions schedule hitting the cron URL with `CRON_SECRET`. |

---

## Appendix A — AI prompt design (Phase 6)

The bullets are read by **clients**, so the prompt must enforce: brand voice, source-cited claims, and outcome-language.

### Prompt skeleton

```
You are writing a project status update for a Helios Marketing client.
Helios is an AI marketing agency. The client reads these bullets directly.

VOICE RULES (from Helios style guide):
- Editorial, confident, direct. No filler. No marketing fluff.
- Outcome-led: what shipped or moved, not what people "worked on."
- Plain about AI: "systems," "pipelines," "automations" — never "magic" or "revolutionary."
- No exclamation marks. No emoji.
- First-person plural ("we shipped," "we kicked off").
- Numbers stay in numerals.
- Title-case for product/feature names; sentence-case otherwise.

PROJECT CONTEXT (do not summarize this, just use it for understanding):
Project name: {project.name}
Client: {client.name}
README:
"""
{project.readmeMarkdown[:2000]}
"""

SCOPE:
- Summarize project activity between {windowStart} and {windowEnd}.
- 3–6 bullets. Each bullet = 1–2 sentences.
- EVERY bullet must cite at least one source eventId from the inputs below.
- If there is nothing meaningful to report, return {"bullets": []}.
- Group related events into a single bullet — don't list every commit.

INPUTS (chronologically interleaved):

{for each event:}
[event:{id}] {type} on {occurredAt} by {authorName}
Title: {title}
{if body:}Body: {body[:500]}{end if}
URL: {url}
---
{end for}

OUTPUT — strict JSON, no prose, no markdown fence:
{
  "bullets": [
    {
      "text": "We shipped the new checkout flow with Apple Pay support.",
      "sources": [{ "eventId": "<id from inputs above>" }]
    }
  ]
}

A bullet without sources, or with an eventId not in the inputs, will be dropped.
Do not invent claims that aren't grounded in the inputs.
Do not include the README in your sources — it's context only.
```

### Output validation
1. `JSON.parse` — on fail, retry once with `"Your previous response was not valid JSON. Return only the JSON object, no other text."`
2. For each bullet: every `sources[].eventId` must exist in the input set. Drop bullets with bad citations.
3. If `bullets.length === 0` after validation, do **not** insert a `ContextUpdate` row.
4. If 6+ bullets after validation, truncate to 6 (preserve order).

### Truncation strategy for long inputs
Per-event: truncate `body` to 500 chars. If a project has > 30 events in the window, take the 30 most recent + summarize older events into a single "Earlier in this window…" preamble (cheaper Haiku call). Don't worry about this until you actually hit it.

### Cost estimate
~10 events × 500 chars + 2KB README ≈ 7K input tokens, 600 output. < $0.05/project/day. < $20/month for 12 projects.

---

## Appendix B — Concrete configs

### `tailwind.config.ts`
```ts
import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        accent: "var(--accent)",
        "accent-hover": "var(--accent-hover)",
        "fg-1": "var(--fg-1)",
        "fg-2": "var(--fg-2)",
        "fg-3": "var(--fg-3)",
        "fg-muted": "var(--fg-muted)",
        "bg-page": "var(--bg-page)",
        "bg-alt": "var(--bg-alt)",
        "bg-dark": "var(--bg-dark)",
        border: "var(--border)",
        "border-soft": "var(--border-soft)",
        "helios-orange": "var(--helios-orange)",
        "helios-green": "var(--helios-green)",
        "helios-green-tint": "var(--helios-green-tint)",
      },
      fontFamily: {
        heading: ["Pragmatica Extended", "Helvetica Neue", "Arial", "sans-serif"],
        body: ["Roboto", "Helvetica Neue", "Arial", "sans-serif"],
      },
      boxShadow: {
        "cta-glow": "0 0 40px -10px var(--helios-orange)",
        "card-hover": "var(--shadow-card-hover)",
      },
      borderRadius: {
        pill: "9999px",
        "card-md": "1rem",
        "card-lg": "2rem",
      },
      transitionTimingFunction: {
        helios: "cubic-bezier(0.16, 1, 0.3, 1)",
      },
    },
  },
  plugins: [],
} satisfies Config;
```

### `next.config.ts`
```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
    ],
  },
};

export default nextConfig;
```

### `app/globals.css`
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@import "../styles/colors_and_type.css";

/* Pragmatica Extended is shipped locally — only Bold weight is licensed */
@font-face {
  font-family: "Pragmatica Extended";
  src: url("/fonts/PragmaticaExtended-Bold.otf") format("opentype");
  font-weight: 700;
  font-style: normal;
  font-display: swap;
}
```

### `app/layout.tsx` (excerpt)
```tsx
// In <head>, load Roboto from Google Fonts:
<link
  href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700;900&display=swap"
  rel="stylesheet"
/>
```

### `vercel.json`
```json
{
  "crons": [
    { "path": "/api/cron/sync-github", "schedule": "*/30 * * * *" },
    { "path": "/api/cron/generate-updates", "schedule": "0 7 * * *" }
  ]
}
```
*If `*/30` isn't supported on your Vercel plan, change to `0 * * * *` (hourly) or move sync to a GitHub Actions schedule.*

### `public/robots.txt`
```
User-agent: *
Disallow: /d/
Disallow: /admin/
```

### Server vs Client component policy
- **Default to Server Components.** Only add `'use client'` when you need state, effects, or browser APIs.
- Dashboard sections are RSCs; the history accordion expand/collapse is the only client component.
- Admin forms are client components (form state).
- Server actions for all mutations.

### Local dev DB workflow
- During Phase 1–2: `npx prisma db push` on every schema change (no migrations needed yet).
- After first real data exists in production: switch to `npx prisma migrate dev` and check migrations into git.
- `npx prisma db seed` after every reset.

---

## Appendix C — TypeScript types

```ts
// lib/types.ts

// Stored in ContextUpdate.bullets (Json column)
export type BulletSource = { eventId: string };
export type Bullet = { text: string; sources: BulletSource[] };
export type ContextUpdateBullets = { bullets: Bullet[] };

// Stored in RepoEvent.meta (Json column), discriminated by RepoEvent.type
export type CommitMeta = {
  // No specific extras — commits are simple
};

export type PrMergedMeta = {
  mergedSha: string;
  baseBranch: string;
  additions?: number;
  deletions?: number;
};

export type IssueClosedMeta = {
  labels: string[];
  closedBy?: string;
  stateReason?: "completed" | "not_planned" | "reopened";
};

export type RepoEventMeta = CommitMeta | PrMergedMeta | IssueClosedMeta;

// For typed access from a Prisma row, cast through a union helper:
export function isPrMergedMeta(meta: unknown): meta is PrMergedMeta {
  return typeof meta === "object" && meta !== null && "mergedSha" in meta;
}
```

---

## Appendix D — Required environment variables

```
# .env.local.example

# Database
DATABASE_URL="postgresql://...neon.tech/..."

# AI
ANTHROPIC_API_KEY="sk-ant-..."

# Auth
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_..."
CLERK_SECRET_KEY="sk_test_..."

# GitHub
GITHUB_TOKEN="github_pat_..."

# Storage
BLOB_READ_WRITE_TOKEN="vercel_blob_rw_..."

# Rate limiting
UPSTASH_REDIS_REST_URL="https://...upstash.io"
UPSTASH_REDIS_REST_TOKEN="..."

# Cron auth
CRON_SECRET="<openssl rand -hex 32>"

# Errors
SENTRY_DSN="https://...@...ingest.sentry.io/..."
```

No Google Cloud credentials. No service account JSON. No Drive folder IDs.

---

## Appendix E — Project README (Claude Code should create this in Phase 0)

````markdown
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
````

---

## Appendix F — Seed script content (Phase 2)

```ts
// prisma/seed.ts — what to put in it

// 1 Client:
//   { name: "Local Boy Outfitters", contactEmail: "demo@localboy.example" }

// 1 Project:
//   {
//     name: "Q3 Content Engine",
//     status: "ACTIVE",
//     startDate: 60 days ago,
//     targetEndDate: 30 days from now,
//     accessToken: "demo-token-replace-me-in-prod",  // hardcoded for easy testing
//     githubRepo: "lucasfigueroa0518/Heliosmarketingwebsite",  // real public repo for testing
//     githubBranch: "main",
//     readmeMarkdown: "## About\n\nA two-paragraph blurb describing the
//        project's goals — generating high-volume AI-driven product photography
//        for the Local Boy SKU catalog, integrated with their Shopify pipeline.",
//   }

// 15 RepoEvents (mixed):
//   8 COMMITs spread across the last 30 days, with realistic-looking messages
//   4 PR_MERGEDs, each with a multi-paragraph body explaining a feature
//   3 ISSUE_CLOSEDs with labels like ["bug"] or ["enhancement"]

// 3 ContextUpdates spaced ~10 days apart:
//   Each with windowStart/windowEnd matching that 10-day window
//   4-5 bullets each, citing real seeded RepoEvent IDs
//   Voice should match the prompt rules in Appendix A
//   Most recent one shows on the dashboard as "Latest Update"
//   Other two show under "Update history"
```

The seeded `demo-token-replace-me-in-prod` lets you visit `/d/demo-token-replace-me-in-prod` immediately during dev. Regenerate with the admin button before any real client gets a link.

---

## Appendix G — Day-1 checklist (paste-ready for Claude Code)

```
Read PLAN.md and the design-system/ folder. Then execute Phase 0 only:

1. Scaffold Next.js 15 + TS + Tailwind v3 + App Router. App name: helios-dashboards.
2. Copy design-system/colors_and_type.css → styles/colors_and_type.css.
3. Copy design-system/fonts/PragmaticaExtended-Bold.otf → public/fonts/.
4. Copy design-system/assets/Helios-logo.png → public/helios-logo.png.
5. Copy design-system/assets/favicon.png → public/favicon.png.
6. Set up tailwind.config.ts, next.config.ts, app/globals.css, and app/layout.tsx
   exactly as specified in PLAN.md Appendix B.
7. Build a <Button variant="primary|outline|dark"> component matching the design
   system — primary must have box-shadow: 0 0 40px -10px #FF5E1A.
8. Build <Eyebrow color="green|orange|ink">, <Pill>, <Card> primitives.
9. Render a placeholder home page using Pragmatica Extended for the headline and
   Roboto Light for the body, with a primary button to confirm the glow renders.
10. prisma init pointed at DATABASE_URL.
11. Create .env.local.example per Appendix D and a .gitignore.
12. Create the project README per Appendix E.
13. Deploy to Vercel.

Stop after the deploy is live. Report the URL. Do not start Phase 1.
```

If this whole plan fits in your head after one read, we're in the right shape. Send it to Lucas, get answers to §8, then start Phase 0.
