import { Octokit } from "@octokit/rest";
import { prisma } from "@/lib/prisma";

const JUNK_COMMIT_RE =
  /^(merge|wip|fixup!|squashed|revert "merge|chore: bump version|update readme$|^\.+$)/i;

function isJunkCommit(title: string, authorLogin: string | null): boolean {
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

export async function syncProject(
  projectId: string
): Promise<{ synced: number; skipped: number }> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { githubRepo: true, githubBranch: true, githubLastSyncAt: true },
  });
  if (!project) throw new Error(`Project ${projectId} not found`);

  const parsed = parseRepo(project.githubRepo);
  if (!parsed) throw new Error(`Invalid repo format: ${project.githubRepo}`);
  const { owner, repo } = parsed;

  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
  const since =
    project.githubLastSyncAt ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  let synced = 0;
  let skipped = 0;

  // Commits
  try {
    const { data: commits } = await octokit.rest.repos.listCommits({
      owner,
      repo,
      sha: project.githubBranch,
      since: since.toISOString(),
      per_page: 100,
    });

    for (const c of commits) {
      const title = c.commit.message.split("\n")[0];
      const login = c.author?.login ?? null;
      if (isJunkCommit(title, login)) {
        skipped++;
        continue;
      }
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
      synced++;
    }
  } catch (e) {
    console.error(`[sync] commits error for ${owner}/${repo}:`, e);
  }

  // Merged PRs
  try {
    const { data: prs } = await octokit.rest.pulls.list({
      owner,
      repo,
      state: "closed",
      sort: "updated",
      direction: "desc",
      per_page: 50,
    });

    for (const pr of prs) {
      if (!pr.merged_at) continue;
      if (new Date(pr.merged_at) < since) continue;
      await prisma.repoEvent.upsert({
        where: {
          projectId_type_externalId: {
            projectId,
            type: "PR_MERGED",
            externalId: String(pr.number),
          },
        },
        create: {
          projectId,
          type: "PR_MERGED",
          externalId: String(pr.number),
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
  } catch (e) {
    console.error(`[sync] PRs error for ${owner}/${repo}:`, e);
  }

  // Closed issues (PRs excluded)
  try {
    const { data: issues } = await octokit.rest.issues.listForRepo({
      owner,
      repo,
      state: "closed",
      sort: "updated",
      direction: "desc",
      since: since.toISOString(),
      per_page: 50,
    });

    for (const issue of issues) {
      if (issue.pull_request) continue;
      if (!issue.closed_at || new Date(issue.closed_at) < since) continue;
      await prisma.repoEvent.upsert({
        where: {
          projectId_type_externalId: {
            projectId,
            type: "ISSUE_CLOSED",
            externalId: String(issue.number),
          },
        },
        create: {
          projectId,
          type: "ISSUE_CLOSED",
          externalId: String(issue.number),
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
  } catch (e) {
    console.error(`[sync] issues error for ${owner}/${repo}:`, e);
  }

  await prisma.project.update({
    where: { id: projectId },
    data: { githubLastSyncAt: new Date() },
  });

  return { synced, skipped };
}

export async function syncAllActiveProjects(): Promise<
  Array<{ id: string; name: string; synced: number; skipped: number; error?: string }>
> {
  const projects = await prisma.project.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, name: true },
  });

  const results = [];
  for (const p of projects) {
    try {
      const counts = await syncProject(p.id);
      results.push({ id: p.id, name: p.name, ...counts });
    } catch (e: unknown) {
      results.push({ id: p.id, name: p.name, synced: 0, skipped: 0, error: String(e) });
    }
  }
  return results;
}
