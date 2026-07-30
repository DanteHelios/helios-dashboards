# SIMPLE FIX PLAN: Repo sync + MVP Delivered toggle

## Context

Two issues from Lucas to address:

1. **Repo sync broken**: creating a new dashboard, can't connect it to a repo for updates.
2. **Timeline needs a toggle**: a mode that says "MVP Delivered" with subtle "Continuous improvements ongoing" instead of the countdown.

The previously-planned per-owner PAT storage system (branch `feat/pat-storage-crypto`) is **parked, not merged**. It will be revisited when AJ or Tommy actually need to self-serve their own PATs. For now, the simpler env-var-swap approach solves Lucas's actual problem in less code with no new attack surface.

---

## Issue 1: Repo sync

### Root cause

`GITHUB_TOKEN` env var holds a PAT tied to `DanteHelios`. That account can't see repos owned by anyone else without a collaborator invite. Most repos are owned by Lucas (`lucasfigueroa0518`).

### Fix

Swap the PAT to one owned by Lucas. Then sync works for all of his repos automatically (he's the owner — no invite needed). For repos owned by future teammates, fall back to the existing collaborator-invite flow and surface a clear error if the sync fails.

### Manual steps (Dante does these, NOT Claude Code)

1. Tell Lucas to:
   - Revoke the PAT he sent over WhatsApp at `github.com/settings/tokens` (it's compromised — exists in screenshots + WhatsApp + this chat)
   - Generate a fresh one: Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate. Scope: `repo`. Expiry: 90 days.
   - Send via 1Password share or similar — NOT WhatsApp/SMS
2. In Vercel → helios-dashboards → Settings → Environment Variables, edit `GITHUB_TOKEN`, paste Lucas's fresh PAT. Apply to Production + Preview + Development.
3. Trigger a redeploy (or push a small commit).
4. Set a calendar reminder for 80 days out to rotate before expiry.

### Code changes (Claude Code does these)

**Schema**

Add to `Project` in `prisma/schema.prisma`:
```prisma
lastSyncError String? // user-facing error message from most recent sync attempt
```

Apply with `prisma db push` (no migrations in this repo — same convention as before).

**Sync error handling**

Wherever Octokit is called from sync code (cron job + manual "Sync now"):
- Wrap calls in try/catch
- On 403 or 404 (the "can't see this repo" errors), catch and write a clear message to `project.lastSyncError`:
  - `"Sync failed: @lucasfigueroa0518 must be added as a collaborator on this repo. (Sync attempted at <time>)"`
- On 401 (revoked/expired PAT): `"GitHub token is invalid or expired. Contact admin to rotate."`
- On successful sync, clear `lastSyncError` (set to null)

**Project detail page (admin)**

Render `lastSyncError` if present, near the sync button. Amber warning style, not a hard error. Include a "Dismiss" or just rely on next successful sync clearing it.

**Copy cleanup**

Search the codebase for these strings and replace:
- `@helios-dashboards-bot` → `@lucasfigueroa0518`
- `DanteHelios` (only where it appears as the *collaborator account name* in user-facing copy — NOT in repo paths like `DanteHelios/helios-dashboards`)
- `helios-dashboards-bot` → `lucasfigueroa0518`

Files most likely to contain these strings (verify with grep):
- `app/admin/projects/new/page.tsx` — form helper text
- `app/admin/projects/[id]/page.tsx` — any inline guidance
- README or docs in the repo

---

## Issue 2: MVP Delivered toggle

### What Lucas wants

A per-project mode where the dashboard's timeline section switches from the countdown progress bar to a static "MVP Delivered" headline with "Continuous improvements ongoing" underneath. Toggleable from the admin panel.

### Schema

Add to `Project`:
```prisma
mvpDelivered Boolean @default(false)
```

Apply with `prisma db push`.

### Admin form

On the project edit page (and create page, for consistency), add a toggle:
- Label: **"MVP Delivered"**
- Helper text: *"When on, replaces the countdown with 'MVP Delivered' + 'Continuous improvements ongoing'."*
- Default: off

UI pattern: match whatever existing form controls look like (checkbox, switch, whatever the codebase uses elsewhere).

### Dashboard rendering

Find the component that renders the centered progress bar + days-remaining (per project memory, this was recently changed from a days-remaining chip to a large centered progress bar).

Branch on `project.mvpDelivered`:

**When false (default):** existing progress bar + countdown. No changes.

**When true:** replace the progress bar block entirely with:
```
[Large headline]    MVP Delivered
[Smaller subtle]    Continuous improvements ongoing
```

Use existing typography scale — the headline at roughly the same visual weight as where the days-remaining number used to be, and the subtitle at the body/secondary-text size. Subtle means muted color (the existing fg-2 or similar token), not bold.

No date math, no progress bar, no countdown when MVP delivered is on. It's a static state.

---

## Files to modify (rough list)

**Schema**
- `prisma/schema.prisma` — add `lastSyncError` and `mvpDelivered` fields

**Sync**
- Wherever Octokit is initialized + sync runs (cron handler, manual sync route)
- Project detail page in admin — render `lastSyncError`

**Project forms**
- Edit page — add MVP Delivered toggle
- Create page — add MVP Delivered toggle (optional, can default off)

**Dashboard view**
- The component with the centered progress bar — branch on `mvpDelivered`

**Copy**
- Anywhere `@helios-dashboards-bot`, `helios-dashboards-bot`, or user-facing `DanteHelios` references exist

---

## Execution order

**Phase A — Sync error surfacing + copy cleanup**
1. Add `lastSyncError` to schema, `prisma db push`
2. Update sync logic to catch 403/404/401 and persist error message
3. Render error on project detail page
4. Find/replace user-facing copy
5. Commit

**Phase B — MVP Delivered toggle**
1. Add `mvpDelivered` to schema, `prisma db push`
2. Toggle on edit form (and create form)
3. Update dashboard view to branch on the flag
4. Commit

**Manual after Phase A merges**
- Lucas generates fresh PAT, Dante swaps `GITHUB_TOKEN` in Vercel
- Verify sync against one of Lucas's repos

---

## What we're NOT doing tonight

- Building self-serve PAT entry UI (parked on `feat/pat-storage-crypto`, revisit when AJ/Tommy onboard)
- AES encryption for PATs in the database (not needed if no PATs are in the database)
- The middleware matcher fix (was tied to the API routes that are now parked)
- Upstash rate limiting (was tied to the same)

---

## Optional cosmetic cleanup (not blocking, do whenever)

- Drop the empty `GitHubToken` table from Supabase if you want a clean schema. Run from Supabase SQL editor: `DROP TABLE "GitHubToken";`
- Remove `TOKEN_ENCRYPTION_KEY` env var from Vercel (it's currently unused)
- The `feat/pat-storage-crypto` branch can stay indefinitely or be deleted — the work is in git history regardless

If you do drop the table and env var, also remove the `GitHubToken` model from `schema.prisma` on `main` so it doesn't get re-created by future `prisma db push` runs.
