import { subDays } from "date-fns";
import { prisma } from "./prisma";
import type { DashboardPageData, ContextUpdateBullets, RepoEvent } from "./types";

const JUNK_COMMIT_RE =
  /^(merge|wip|fixup!|squashed|revert "merge|chore: bump version|update readme$|^\.+$)/i;

function isJunk(title: string) {
  return JUNK_COMMIT_RE.test(title) || title.trim().length < 5;
}

function toRepoEvent(e: {
  id: string;
  projectId: string;
  type: "COMMIT" | "PR_MERGED" | "ISSUE_CLOSED" | "RELEASE";
  externalId: string;
  title: string;
  body: string | null;
  authorName: string;
  authorLogin: string | null;
  authorAvatarUrl: string | null;
  url: string;
  occurredAt: Date;
}): RepoEvent {
  return {
    id: e.id,
    projectId: e.projectId,
    type: e.type as RepoEvent["type"],
    externalId: e.externalId,
    title: e.title,
    body: e.body,
    authorName: e.authorName,
    authorLogin: e.authorLogin,
    authorAvatarUrl: e.authorAvatarUrl,
    url: e.url,
    occurredAt: e.occurredAt,
  };
}

export async function getDashboardData(
  token: string
): Promise<DashboardPageData | null> {
  const project = await prisma.project.findUnique({
    where: { accessToken: token },
    include: { client: { select: { id: true, name: true } } },
  });

  if (!project) return null;

  const now = new Date();
  const sixtyDaysAgo = subDays(now, 60);
  const fourteenDaysAgo = subDays(now, 14);

  const [allUpdates, recentEventsRaw] = await Promise.all([
    prisma.contextUpdate.findMany({
      where: {
        projectId: project.id,
        generatedAt: { gte: sixtyDaysAgo },
      },
      orderBy: { generatedAt: "desc" },
    }),
    prisma.repoEvent.findMany({
      where: {
        projectId: project.id,
        occurredAt: { gte: fourteenDaysAgo },
        type: { in: ["COMMIT", "PR_MERGED", "ISSUE_CLOSED"] },
      },
      orderBy: { occurredAt: "desc" },
      take: 30,
    }),
  ]);

  const [latestUpdate, ...historyUpdates] = allUpdates;

  const recentEvents = recentEventsRaw
    .filter((e) => e.type !== "COMMIT" || !isJunk(e.title))
    .map(toRepoEvent);

  // Collect all event IDs cited across all updates so source chips resolve correctly
  const citedIds = new Set<string>();
  for (const update of allUpdates) {
    const b = update.bullets as ContextUpdateBullets;
    for (const bullet of b.bullets) {
      for (const s of bullet.sources) citedIds.add(s.eventId);
    }
  }

  // Fetch cited events not already in recentEvents
  const recentIds = new Set(recentEvents.map((e) => e.id));
  const missingIds = [...citedIds].filter((id) => !recentIds.has(id));

  const sourceEvents =
    missingIds.length > 0
      ? await prisma.repoEvent.findMany({ where: { id: { in: missingIds } } })
      : [];

  const eventsById: Record<string, RepoEvent> = {};
  for (const e of [...recentEvents, ...sourceEvents.map(toRepoEvent)]) {
    eventsById[e.id] = e;
  }

  return {
    project: {
      id: project.id,
      name: project.name,
      status: project.status,
      startDate: project.startDate,
      targetEndDate: project.targetEndDate,
      completedAt: project.completedAt,
      accessToken: project.accessToken,
      deckPdfUrl: project.deckPdfUrl,
      githubRepo: project.githubRepo,
      cronEnabled: project.cronEnabled,
      cronStatus: project.cronStatus,
      client: project.client,
    },
    latestUpdate: latestUpdate
      ? {
          id: latestUpdate.id,
          projectId: latestUpdate.projectId,
          bullets: latestUpdate.bullets as ContextUpdateBullets,
          windowStart: latestUpdate.windowStart,
          windowEnd: latestUpdate.windowEnd,
          generatedAt: latestUpdate.generatedAt,
          generatedBy: latestUpdate.generatedBy as "CRON" | "MANUAL",
        }
      : null,
    historyUpdates: historyUpdates.map((u) => ({
      id: u.id,
      projectId: u.projectId,
      bullets: u.bullets as ContextUpdateBullets,
      windowStart: u.windowStart,
      windowEnd: u.windowEnd,
      generatedAt: u.generatedAt,
      generatedBy: u.generatedBy as "CRON" | "MANUAL",
    })),
    recentEvents,
    eventsById,
  };
}
