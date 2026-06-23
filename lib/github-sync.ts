import { Octokit } from "@octokit/rest";
import type { RestEndpointMethodTypes } from "@octokit/rest";
import { prisma } from "@/lib/prisma";

export type CommitItem =
  RestEndpointMethodTypes["repos"]["listCommits"]["response"]["data"][number];

type RepoEventTypeStr = "COMMIT" | "PR_MERGED" | "ISSUE_CLOSED";

// Stop walking pages once we've seen this many consecutive items already in the
// DB — i.e. we've reached already-synced territory. Late-merged commits carry
// old commit dates and sit deep in the reverse-chronological listing, so a date
// window misses them; convergence walks past them until known SHAs are hit.
const CONVERGE_N = 20;
// Hard cap so a cold/empty DB (nothing is "known") can't paginate forever.
const MAX_PAGES = 10;
const PER_PAGE = 100;

const JUNK_COMMIT_RE =
  /^(merge|wip|fixup!|squashed|revert "merge|chore: bump version|update readme$|^\.+$)/i;

export function isJunkCommit(title: string, authorLogin: string | null): boolean {
  if (authorLogin?.endsWith("[bot]")) return true;
  return JUNK_COMMIT_RE.test(title) || title.trim().length < 5;
}

function parseRepo(githubRepo: string): { owner: string; repo: string } | null {
  const parts = githubRepo.split("/");
  if (parts.length === 2 && parts[0] && parts[1]) {
    return { owner: parts[0], repo: parts[1] };
  }
  return null;
}

// GitHub account whose PAT is in GITHUB_TOKEN. Repos owned by other accounts
// must add this account as a collaborator for sync to see them.
const SYNC_ACCOUNT = "lucasfigueroa0518";

function syncStamp(): string {
  return new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC";
}

function syncErrorMessage(err: unknown): string {
  const status = (err as { status?: number }).status;
  const at = `(Sync attempted at ${syncStamp()})`;
  if (status === 401) {
    return `GitHub token is invalid or expired. Contact admin to rotate. ${at}`;
  }
  if (status === 403 || status === 404) {
    return `Sync failed: @${SYNC_ACCOUNT} must be added as a collaborator on this repo. ${at}`;
  }
  const detail = err instanceof Error ? err.message : String(err);
  return `Sync failed: ${detail} ${at}`;
}

// Shared commit -> RepoEvent mapping so syncProject and the backfill script
// can't drift. Upserts on the (projectId, COMMIT, sha) unique key, so it is
// idempotent and safe to call on commits that already exist.
export async function upsertCommitEvent(
  projectId: string,
  c: CommitItem
): Promise<void> {
  const title = c.commit.message.split("\n")[0];
  const login = c.author?.login ?? null;
  await prisma.repoEvent.upsert({
    where: {
      projectId_type_externalId: { projectId, type: "COMMIT", externalId: c.sha },
    },
    create: {
      projectId,
      type: "COMMIT",
      externalId: c.sha,
      title,
      body: c.commit.message.slice(title.length).trim() || null,
      authorName: c.commit.author?.name ?? login ?? "Unknown",
      authorLogin: login,
      authorAvatarUrl: c.author?.avatar_url ?? null,
      url: c.html_url,
      occurredAt: new Date(c.commit.author?.date ?? Date.now()),
      meta: {},
    },
    update: {},
  });
}

// Which of the given externalIds are already stored for this project+type.
async function existingIds(
  projectId: string,
  type: RepoEventTypeStr,
  ids: string[]
): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await prisma.repoEvent.findMany({
    where: { projectId, type, externalId: { in: ids } },
    select: { externalId: true },
  });
  return new Set(rows.map((r) => r.externalId));
}

export async function syncProject(
  projectId: string
): Promise<{ synced: number; skipped: number }> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { githubRepo: true, githubBranch: true },
  });
  if (!project) throw new Error(`Project ${projectId} not found`);

  const parsed = parseRepo(project.githubRepo);
  if (!parsed) {
    const msg = `Sync failed: "${project.githubRepo}" is not a valid owner/repo. (Sync attempted at ${syncStamp()})`;
    await prisma.project.update({ where: { id: projectId }, data: { lastSyncError: msg } });
    throw new Error(msg);
  }
  const { owner, repo } = parsed;

  // Fast-fail: an empty/missing token makes Octokit run unauthenticated, which
  // silently succeeds on public repos (and rate-limits at 60/hr). Surface it.
  const token = process.env.GITHUB_TOKEN;
  if (!token || token.trim() === "") {
    const msg = `Sync failed: GITHUB_TOKEN is not configured. Contact admin. (Sync attempted at ${syncStamp()})`;
    await prisma.project.update({ where: { id: projectId }, data: { lastSyncError: msg } });
    throw new Error(msg);
  }

  const octokit = new Octokit({ auth: token });

  // Up-front access check so permission failures (401/403/404) surface clearly
  // instead of being swallowed by the per-resource blocks below.
  try {
    await octokit.rest.repos.get({ owner, repo });
  } catch (err) {
    const msg = syncErrorMessage(err);
    await prisma.project.update({ where: { id: projectId }, data: { lastSyncError: msg } });
    throw new Error(msg);
  }

  let synced = 0;
  let skipped = 0;
  // Collect failures instead of swallowing them. Rows already upserted before a
  // failure are kept, but the run is NOT marked clean (lastSyncError is set and
  // githubLastSyncAt is left untouched).
  const errors: string[] = [];

  // Commits — SHA-convergence pagination (newest -> oldest).
  try {
    let consecutiveKnown = 0;
    for (let page = 1; page <= MAX_PAGES; page++) {
      const { data: commits } = await octokit.rest.repos.listCommits({
        owner,
        repo,
        sha: project.githubBranch,
        per_page: PER_PAGE,
        page,
      });
      if (commits.length === 0) break;

      const known = await existingIds(
        projectId,
        "COMMIT",
        commits.map((c) => c.sha)
      );

      let converged = false;
      for (const c of commits) {
        if (known.has(c.sha)) {
          if (++consecutiveKnown >= CONVERGE_N) {
            converged = true;
            break;
          }
          continue;
        }
        consecutiveKnown = 0;
        const title = c.commit.message.split("\n")[0];
        if (isJunkCommit(title, c.author?.login ?? null)) {
          skipped++;
          continue;
        }
        await upsertCommitEvent(projectId, c);
        synced++;
      }

      if (converged || commits.length < PER_PAGE) break;
    }
  } catch (e) {
    console.error(`[sync] commits error for ${owner}/${repo}:`, e);
    errors.push(syncErrorMessage(e));
  }

  // Merged PRs — convergence on already-stored PR numbers.
  try {
    let consecutiveKnown = 0;
    for (let page = 1; page <= MAX_PAGES; page++) {
      const { data: prs } = await octokit.rest.pulls.list({
        owner,
        repo,
        state: "closed",
        sort: "updated",
        direction: "desc",
        per_page: PER_PAGE,
        page,
      });
      if (prs.length === 0) break;

      const known = await existingIds(
        projectId,
        "PR_MERGED",
        prs.map((pr) => String(pr.number))
      );

      let converged = false;
      for (const pr of prs) {
        const id = String(pr.number);
        if (known.has(id)) {
          if (++consecutiveKnown >= CONVERGE_N) {
            converged = true;
            break;
          }
          continue;
        }
        if (!pr.merged_at) continue; // closed-but-not-merged: not storable
        consecutiveKnown = 0;
        await prisma.repoEvent.upsert({
          where: {
            projectId_type_externalId: {
              projectId,
              type: "PR_MERGED",
              externalId: id,
            },
          },
          create: {
            projectId,
            type: "PR_MERGED",
            externalId: id,
            title: pr.title,
            body: pr.body?.slice(0, 2000) ?? null,
            authorName: pr.user?.login ?? "Unknown",
            authorLogin: pr.user?.login ?? null,
            authorAvatarUrl: pr.user?.avatar_url ?? null,
            url: pr.html_url,
            occurredAt: new Date(pr.merged_at),
            meta: {
              mergedSha: pr.merge_commit_sha ?? "",
              baseBranch: pr.base.ref,
            },
          },
          update: {},
        });
        synced++;
      }

      if (converged || prs.length < PER_PAGE) break;
    }
  } catch (e) {
    console.error(`[sync] PRs error for ${owner}/${repo}:`, e);
    errors.push(syncErrorMessage(e));
  }

  // Closed issues (PRs excluded) — convergence on already-stored issue numbers.
  try {
    let consecutiveKnown = 0;
    for (let page = 1; page <= MAX_PAGES; page++) {
      const { data: issues } = await octokit.rest.issues.listForRepo({
        owner,
        repo,
        state: "closed",
        sort: "updated",
        direction: "desc",
        per_page: PER_PAGE,
        page,
      });
      if (issues.length === 0) break;

      const known = await existingIds(
        projectId,
        "ISSUE_CLOSED",
        issues.map((issue) => String(issue.number))
      );

      let converged = false;
      for (const issue of issues) {
        const id = String(issue.number);
        if (known.has(id)) {
          if (++consecutiveKnown >= CONVERGE_N) {
            converged = true;
            break;
          }
          continue;
        }
        if (issue.pull_request || !issue.closed_at) continue; // not a storable issue
        consecutiveKnown = 0;
        await prisma.repoEvent.upsert({
          where: {
            projectId_type_externalId: {
              projectId,
              type: "ISSUE_CLOSED",
              externalId: id,
            },
          },
          create: {
            projectId,
            type: "ISSUE_CLOSED",
            externalId: id,
            title: issue.title,
            body: issue.body?.slice(0, 2000) ?? null,
            authorName: issue.user?.login ?? "Unknown",
            authorLogin: issue.user?.login ?? null,
            authorAvatarUrl: issue.user?.avatar_url ?? null,
            url: issue.html_url,
            occurredAt: new Date(issue.closed_at),
            meta: {
              labels: issue.labels.map((l) => (typeof l === "string" ? l : (l.name ?? ""))),
              closedBy: issue.closed_by?.login,
            },
          },
          update: {},
        });
        synced++;
      }

      if (converged || issues.length < PER_PAGE) break;
    }
  } catch (e) {
    console.error(`[sync] issues error for ${owner}/${repo}:`, e);
    errors.push(syncErrorMessage(e));
  }

  // Partial failure: keep whatever was upserted, but do NOT mark the run clean.
  if (errors.length > 0) {
    const msg = errors[0];
    await prisma.project.update({ where: { id: projectId }, data: { lastSyncError: msg } });
    throw new Error(msg);
  }

  // githubLastSyncAt is display-only ("last clean sync"), never used as a filter.
  await prisma.project.update({
    where: { id: projectId },
    data: { githubLastSyncAt: new Date(), lastSyncError: null },
  });

  return { synced, skipped };
}
