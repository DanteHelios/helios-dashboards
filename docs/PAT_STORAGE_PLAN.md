# PLAN: Per-Owner GitHub PAT Storage System

## Context

Currently, `GITHUB_TOKEN` is a single env var holding a PAT tied to `DanteHelios`. This means:
- Any repo we want to sync must have `DanteHelios` added as a collaborator
- The codebase has stale references to `@helios-dashboards-bot` (a planned but never-created service account)
- Repos owned by Lucas, AJ, Tommy, or future teammates require manual collaborator invites every time

The fix: store a PAT per GitHub account (encrypted at rest), and at sync time, look up the right PAT based on the repo's owner. Repo owners no longer need to invite anyone — they just drop their own PAT into the admin panel once.

This also gives us a clean foundation for the eventual GitHub App migration: when that lands, we replace token lookup with App installation lookup, but the per-owner model stays.

---

## Goals

**Functional**
- Admin can add, view (masked), and delete PATs for any GitHub account
- Sync logic resolves the right PAT based on `owner` extracted from a project's `githubRepo` path
- Project creation form surfaces clearly when no PAT exists for the repo owner
- Sync errors caused by missing/revoked/invalid PATs produce actionable messages in the admin panel (not silent failures)

**Security**
- PATs encrypted at rest with AES-256-GCM
- Encryption key in env var, never committed
- PATs never returned in plaintext from any API (write-only after creation)
- Only last 4 characters of PAT shown in UI, after the prefix (`github_pat_•••••XXXX`)
- PAT validated against GitHub API on submit (must successfully authenticate AND match claimed handle)
- All PAT add/delete actions audit-logged with Clerk user ID
- Error messages scrubbed for any PAT-like substrings before logging
- Add endpoint rate-limited via Upstash (already in stack)

---

## Architecture

### Schema (Prisma)

Add to `prisma/schema.prisma`:

```prisma
model GitHubToken {
  id             String    @id @default(cuid())
  githubHandle   String    @unique // e.g. "lucasfigueroa0518"
  encryptedToken String    // base64 ciphertext
  iv             String    // base64 IV (12 bytes for GCM)
  authTag        String    // base64 GCM auth tag (16 bytes)
  tokenSuffix    String    // last 4 chars of raw PAT, for UI display only
  addedByUserId  String    // Clerk user ID
  addedByEmail   String    // for audit display
  lastUsedAt     DateTime?
  expiresAt      DateTime? // optional, surfaced as warnings near expiry
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  @@index([githubHandle])
}
```

The `Project` model does NOT need a token foreign key. Token resolution happens at sync time by parsing the existing `githubRepo` field (e.g. `lucasfigueroa0518/Medina-Intelligence` → owner is `lucasfigueroa0518`).

### Encryption module: `lib/crypto.ts`

```typescript
import crypto from 'node:crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;

function getKey(): Buffer {
  const k = process.env.TOKEN_ENCRYPTION_KEY;
  if (!k) throw new Error('TOKEN_ENCRYPTION_KEY not set');
  const buf = Buffer.from(k, 'base64');
  if (buf.length !== 32) {
    throw new Error('TOKEN_ENCRYPTION_KEY must decode to 32 bytes');
  }
  return buf;
}

export function encryptToken(plaintext: string) {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    encryptedToken: ct.toString('base64'),
    iv: iv.toString('base64'),
    authTag: tag.toString('base64'),
  };
}

export function decryptToken(encryptedToken: string, iv: string, authTag: string): string {
  const decipher = crypto.createDecipheriv(ALGO, getKey(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(authTag, 'base64'));
  const pt = Buffer.concat([
    decipher.update(Buffer.from(encryptedToken, 'base64')),
    decipher.final(),
  ]);
  return pt.toString('utf8');
}
```

**CRITICAL**: `TOKEN_ENCRYPTION_KEY` must never change once tokens are stored, or all existing tokens become unrecoverable. Back the key up somewhere safe (1Password or equivalent). If it ever needs to rotate, implement a key-versioning migration first.

### Token resolution: `lib/getTokenForRepo.ts`

```typescript
import { prisma } from './prisma';
import { decryptToken } from './crypto';

export async function getTokenForRepo(githubRepo: string): Promise<string | null> {
  const owner = githubRepo.split('/')[0]?.toLowerCase();
  if (!owner) return null;
  const row = await prisma.gitHubToken.findFirst({
    where: { githubHandle: { equals: owner, mode: 'insensitive' } },
  });
  if (!row) return null;
  // Update lastUsedAt fire-and-forget
  prisma.gitHubToken.update({
    where: { id: row.id },
    data: { lastUsedAt: new Date() },
  }).catch(() => {});
  return decryptToken(row.encryptedToken, row.iv, row.authTag);
}
```

### Sync refactor

Wherever Octokit is currently initialized as a singleton with `GITHUB_TOKEN`, change to per-call:

```typescript
// before:
const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

// after:
const token = await getTokenForRepo(project.githubRepo);
if (!token) {
  throw new SyncError('NO_TOKEN', `No PAT stored for @${owner}. Add one in Admin → Tokens.`);
}
const octokit = new Octokit({ auth: token });
```

Custom error class `SyncError` with codes `NO_TOKEN`, `INVALID_TOKEN` (401), `NO_ACCESS` (403/404), `UPSTREAM` (other). Sync code wraps Octokit calls in try/catch and translates GitHub responses into these typed errors. Each error code maps to a user-facing message stored on the project record for display in the admin panel.

### API routes

`POST /api/admin/tokens` — create
- Body: `{ githubHandle, token, expiresAt? }`
- Validate token format: regex `^(github_pat_|ghp_)[A-Za-z0-9_]+$`
- Call `GET https://api.github.com/user` with the token; require 200 and `login.toLowerCase() === githubHandle.toLowerCase()`
- Reject if handle mismatch (prevents users from associating a PAT with the wrong handle)
- Encrypt, store, return `{ id, githubHandle, tokenSuffix, expiresAt }` (no decrypted token)

`GET /api/admin/tokens` — list
- Returns all rows, with `tokenSuffix` and metadata. Never returns ciphertext or plaintext.

`DELETE /api/admin/tokens/:id` — remove

All routes gated by existing Clerk middleware (already restricted to `@heliosmarketing.org`). Add `auth()` check at top of each handler to get `userId` for audit fields.

Rate limit `POST` via Upstash: 5 requests/hour/user.

### Admin UI

New page: `app/admin/tokens/page.tsx`

**List view** — table with columns:
- GitHub handle (linked to `github.com/<handle>`)
- Token (`github_pat_•••••<suffix>`)
- Added by (email)
- Last used (relative time, "Never" if null)
- Expires (relative, with warning color if <14 days)
- Actions: Delete (confirm modal)

**Add form** at top:
- GitHub handle (text input, required)
- PAT (password input, `autocomplete="off"`, show/hide toggle, required)
- Optional expiry date picker
- Submit button

**After successful add**, show one-time confirmation: "Added @username. Token ends in `XXXX`. You won't see the full token again."

Add `Tokens` nav link to `app/admin/layout.tsx`.

### Project creation form integration

In the existing project creation form, after the user enters `githubRepo`, async-check token availability:

- `GET /api/admin/tokens?handle=<owner>` (new helper endpoint or reuse list and filter client-side)
- If token exists: green checkmark, "✓ Synced via @owner's PAT"
- If not: amber warning, "⚠ No PAT stored for @owner. The dashboard will be created, but won't sync until a PAT is added. [Add now →]" (link to `/admin/tokens?prefill=<owner>`)

Does not block project creation (so projects can be set up before PATs are ready).

---

## Security details

- **Algorithm**: AES-256-GCM with 12-byte random IV per token (standard for GCM). Auth tag prevents tampering and verifies key correctness.
- **Key generation**: `openssl rand -base64 32` → paste into `TOKEN_ENCRYPTION_KEY` env var on Vercel (Production + Preview + Development environments) AND in `.env.local`.
- **No plaintext logging**: add a log scrubber utility that runs error messages through `replace(/(github_pat_|ghp_)[A-Za-z0-9_]+/g, '[REDACTED]')` before any `console.error` or external logging.
- **No plaintext in responses**: the API layer should not have any code path that returns a decrypted token to the client. Decryption only happens server-side in sync code.
- **Input validation**:
  - Regex check on PAT format
  - GitHub `/user` verification before persisting (catches typos, revoked tokens, and handle mismatches in one step)
- **Audit trail**: `addedByUserId` + `addedByEmail` on every token row. For deletes, optionally add a separate `TokenDeletionLog` table if Lucas wants stricter audit (out of scope for v1).
- **HTTPS**: enforced by Vercel by default.
- **Scope guidance**: when telling teammates how to generate their PAT, instruct them to use **classic PAT with `repo` scope** (read+write on private repos). Fine-grained PATs are more secure but require per-repo setup and complicate the UX. Revisit later.
- **Token storage in transit**: PAT is submitted via HTTPS POST body, never via URL params (which would leak to access logs).

---

## Files to create

- `lib/crypto.ts` — encryption utilities
- `lib/getTokenForRepo.ts` — resolves token from repo path
- `lib/scrubLogs.ts` — utility to redact PAT-like strings from error messages
- `lib/syncError.ts` — typed `SyncError` class with error codes
- `prisma/migrations/[timestamp]_github_tokens/migration.sql` — generated by `prisma migrate dev`
- `app/api/admin/tokens/route.ts` — GET (list) + POST (create)
- `app/api/admin/tokens/[id]/route.ts` — DELETE
- `app/admin/tokens/page.tsx` — main admin UI
- `components/admin/AddTokenForm.tsx`
- `components/admin/TokenList.tsx`
- `components/admin/DeleteTokenButton.tsx`

## Files to modify

- `prisma/schema.prisma` — add `GitHubToken` model
- Wherever Octokit is currently initialized — switch from env-var singleton to per-call factory using `getTokenForRepo`
- Sync logic (cron handler + any manual "Sync now" handler) — catch typed errors, persist user-facing message to project record
- Project creation form — token availability indicator
- Project detail page in admin — show sync error state if present
- `app/admin/layout.tsx` — add Tokens nav link
- Any current copy referencing `@helios-dashboards-bot` or `DanteHelios` as the collaborator account → either remove (now contextual per repo owner) or replace with dynamic owner reference
- `.env.example` — add `TOKEN_ENCRYPTION_KEY` placeholder

---

## Step-by-step execution

Execute in order. Commit between each phase so partial failures are recoverable.

**Phase 1: Encryption foundation**
1. Generate `TOKEN_ENCRYPTION_KEY`: run `openssl rand -base64 32`, save the output
2. Add `TOKEN_ENCRYPTION_KEY` to Vercel dashboard env vars (Production, Preview, Development)
3. Add to `.env.local`
4. Create `lib/crypto.ts`
5. Write a quick smoke test: encrypt → decrypt → assert equality
6. Commit: `feat(crypto): aes-256-gcm token encryption module`

**Phase 2: Schema + model**
1. Add `GitHubToken` to `prisma/schema.prisma`
2. Run `npx prisma migrate dev --name github_tokens`
3. Verify migration in Supabase
4. Commit: `feat(db): GitHubToken model`

**Phase 3: API routes**
1. Create `app/api/admin/tokens/route.ts` (GET, POST)
2. Create `app/api/admin/tokens/[id]/route.ts` (DELETE)
3. Implement GitHub `/user` verification on POST
4. Add Upstash rate limiting to POST
5. Test all routes via curl or Postman
6. Commit: `feat(api): GitHub token CRUD endpoints`

**Phase 4: Admin UI**
1. Create `app/admin/tokens/page.tsx` and components
2. Wire up to API routes
3. Add nav link in admin layout
4. Test full add/list/delete flow in browser
5. Commit: `feat(admin): GitHub token management UI`

**Phase 5: Sync refactor**
1. Create `lib/getTokenForRepo.ts`, `lib/syncError.ts`, `lib/scrubLogs.ts`
2. Replace Octokit singleton with per-call factory
3. Wrap sync calls in try/catch, persist typed errors to project record
4. Update project detail page to show sync error if present
5. Test with a real repo (add Lucas's PAT first via the new UI)
6. Commit: `refactor(sync): per-repo token resolution`

**Phase 6: Project form integration**
1. Add async token availability check in project creation form
2. Show ✓ or ⚠ indicator
3. Link to `/admin/tokens?prefill=<owner>` for missing tokens
4. Commit: `feat(admin): token availability indicator on project form`

**Phase 7: Cleanup**
1. Remove `GITHUB_TOKEN` references from code
2. Remove `GITHUB_TOKEN` from Vercel env vars (after verifying everything works)
3. Update any stale copy referencing `@helios-dashboards-bot` or `DanteHelios` as the collaborator account
4. Update `.env.example`
5. Commit: `chore: remove legacy GITHUB_TOKEN env var`

---

## Post-deployment checklist (manual)

After Phase 7 ships:

1. Lucas generates a **fresh** PAT (classic, `repo` scope, 90-day expiry). The PAT sent over WhatsApp earlier should be **revoked** at github.com/settings/tokens.
2. Dante enters the fresh PAT through `/admin/tokens`.
3. Verify sync works on one of Lucas's repos.
4. AJ and Tommy can self-serve their own PATs once they're onboarded.
5. Set a calendar reminder for 80 days out to rotate PATs before expiry.
6. Back up `TOKEN_ENCRYPTION_KEY` to 1Password or equivalent.

---

## Testing checklist

- [ ] Encrypt + decrypt round-trip works
- [ ] Tampered ciphertext throws on decrypt (auth tag check)
- [ ] Missing `TOKEN_ENCRYPTION_KEY` throws clear error
- [ ] POST with valid PAT + matching handle: succeeds
- [ ] POST with PAT for different handle than claimed: rejected
- [ ] POST with invalid PAT format: rejected before hitting GitHub
- [ ] POST with revoked PAT: GitHub returns 401, rejected with clear message
- [ ] List endpoint never returns ciphertext or plaintext, only suffix + metadata
- [ ] Delete works, audit trail preserved (or row hard-deleted, depending on choice)
- [ ] Rate limit triggers after 5 POSTs/hour
- [ ] Sync against repo with matching PAT: works
- [ ] Sync against repo with no matching PAT: surfaces `NO_TOKEN` error on project detail page
- [ ] Sync after PAT is revoked: surfaces `INVALID_TOKEN` error
- [ ] Sync against repo not visible to the PAT: surfaces `NO_ACCESS` error
- [ ] Project form shows ✓ for repo with matching PAT
- [ ] Project form shows ⚠ for repo without matching PAT
- [ ] Error logs do not contain PAT plaintext (test by deliberately throwing with a fake PAT in the message)

---

## Out of scope (for v2 / future)

- Self-rotation flow with overlap window (today: delete + re-add)
- Email warnings when PATs are nearing expiry
- Fine-grained PAT support
- GitHub App migration (the eventual end-state that eliminates PATs entirely)
- RBAC inside the admin panel (currently all `@heliosmarketing.org` users have full access)
- Soft-delete + tombstones for audit
