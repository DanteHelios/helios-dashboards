/**
 * ONE-TIME backfill for the Medina Intelligence Platform project.
 *
 * Why: the old sync filtered commits by `since = githubLastSyncAt`. Commits that
 * merged into main out of date-order (late feature-branch merges) carry old
 * commit dates and fell behind the watermark, so ~30 non-junk commits were never
 * ingested. This walks the FULL history of main (no convergence stop, no date
 * floor), junk-filters to match ongoing behavior, and upserts. Dedup is handled
 * by the (projectId, COMMIT, sha) unique key, so re-running is safe.
 *
 * Run MANUALLY, never wired into cron. Run AFTER the real GITHUB_TOKEN is set in
 * the environment — full-history pagination unauthenticated would hit the
 * 60-req/hr limit and truncate mid-backfill.
 *
 *   npx tsx --env-file=.env --env-file=.env.local scripts/backfill-medina.ts
 */
import { Octokit } from "@octokit/rest";
import { prisma } from "@/lib/prisma";
import { isJunkCommit, upsertCommitEvent } from "@/lib/github-sync";

const OWNER = "lucasfigueroa0518";
const REPO = "Medina-Intelligence";
const BRANCH = "main";

async function main() {
  const token = process.env.GITHUB_TOKEN;
  if (!token || token.trim() === "") {
    console.error(
      "GITHUB_TOKEN is not set. Set the real PAT before running the backfill " +
        "(unauthenticated requests hit the 60/hr limit and truncate history)."
    );
    process.exit(1);
  }

  const project = await prisma.project.findFirst({
    where: { githubRepo: { equals: `${OWNER}/${REPO}`, mode: "insensitive" } },
    select: { id: true, name: true, githubRepo: true },
  });
  if (!project) {
    console.error(`No project found with githubRepo = ${OWNER}/${REPO}`);
    process.exit(1);
  }
  console.log(`Backfilling "${project.name}" (${project.id}) from ${project.githubRepo}`);

  const before = await prisma.repoEvent.count({
    where: { projectId: project.id, type: "COMMIT" },
  });
  console.log(`COMMIT events before: ${before}`);

  const octokit = new Octokit({ auth: token });

  let synced = 0;
  let skipped = 0;
  let seen = 0;

  // Walk ALL commits on the branch, oldest history included. No convergence
  // stop and no date floor — this is a full backfill.
  const iterator = octokit.paginate.iterator(octokit.rest.repos.listCommits, {
    owner: OWNER,
    repo: REPO,
    sha: BRANCH,
    per_page: 100,
  });

  for await (const { data: commits } of iterator) {
    for (const c of commits) {
      seen++;
      const title = c.commit.message.split("\n")[0];
      if (isJunkCommit(title, c.author?.login ?? null)) {
        skipped++;
        continue;
      }
      await upsertCommitEvent(project.id, c);
      synced++;
    }
    console.log(`  ...processed ${seen} commits so far (upserted ${synced}, skipped junk ${skipped})`);
  }

  const after = await prisma.repoEvent.count({
    where: { projectId: project.id, type: "COMMIT" },
  });

  console.log("\n=== Backfill complete ===");
  console.log(`commits seen on ${BRANCH}: ${seen}`);
  console.log(`non-junk upserted: ${synced}`);
  console.log(`junk skipped: ${skipped}`);
  console.log(`COMMIT events: ${before} -> ${after} (net new: ${after - before})`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
