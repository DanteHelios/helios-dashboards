// ContextUpdate bullet types (stored as JSON in DB)
export type BulletSource = { eventId: string };
export type Bullet = { text: string; sources: BulletSource[] };
export type ContextUpdateBullets = { bullets: Bullet[] };

// RepoEvent.meta discriminated union
export type CommitMeta = Record<string, never>;

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

export function isPrMergedMeta(meta: unknown): meta is PrMergedMeta {
  return typeof meta === "object" && meta !== null && "mergedSha" in meta;
}

// Mirror of Prisma enums
export type RepoEventType = "COMMIT" | "PR_MERGED" | "ISSUE_CLOSED";
export type ProjectStatus = "ACTIVE" | "PAUSED" | "COMPLETE" | "ARCHIVED";

// Page-level data types — mirror the Prisma model shape so Phase 2 swap is one line
export type RepoEvent = {
  id: string;
  projectId: string;
  type: RepoEventType;
  externalId: string;
  title: string;
  body: string | null;
  authorName: string;
  authorLogin: string | null;
  authorAvatarUrl: string | null;
  url: string;
  occurredAt: Date;
  meta: unknown;
  fetchedAt: Date;
};

export type ContextUpdate = {
  id: string;
  projectId: string;
  bullets: ContextUpdateBullets;
  windowStart: Date;
  windowEnd: Date;
  generatedAt: Date;
};

export type DashboardProject = {
  id: string;
  name: string;
  status: ProjectStatus;
  startDate: Date;
  targetEndDate: Date;
  completedAt: Date | null;
  accessToken: string;
  deckPdfUrl: string | null;
  client: { id: string; name: string };
};

export type DashboardPageData = {
  project: DashboardProject;
  latestUpdate: ContextUpdate | null;
  historyUpdates: ContextUpdate[];
  recentEvents: RepoEvent[];
};
