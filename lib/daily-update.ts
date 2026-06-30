import { prisma } from "@/lib/prisma";
import { syncProject } from "@/lib/github-sync";
import { generateUpdate } from "@/lib/ai";
import { captureException } from "@/lib/monitoring";

export type DailyUpdateResult = {
  id: string;
  name: string;
  synced: number;
  skipped: number;
  generated: boolean;
  source?: "ai" | "fallback";
  syncError?: string;
  generateError?: string;
  generateSkipped?: string;
};

// Minimum spacing between auto-generated updates. The cron now fires DAILY
// (09:00 UTC); this in-route check is what produces the intended ~48h cadence,
// replacing the old day-of-month step ("*/2") that drifted at month boundaries.
// 47h (1h under 48h) gives the every-other-day run slack so normal scheduler
// jitter can't push it out to every third day.
const MIN_HOURS_BETWEEN_UPDATES = 47;

/**
 * One daily pass: per ACTIVE project, sync from GitHub, then generate an AI
 * update ONLY when the sync brought in new events (synced > 0) and the project
 * has auto-updates enabled (cronEnabled). This is the cost control — Anthropic
 * is never called on a no-activity day, and no empty ContextUpdate row is written.
 *
 * Reuses the same primitives the admin buttons call:
 *   - syncProject(id)      (same as the "Sync now" button)
 *   - generateUpdate(id)   (same as "Generate now", but WITHOUT { manual: true }
 *                           so it uses the incremental window — floor on the
 *                           prior update's windowEnd — and never append-duplicates)
 *
 * Resilience: each project's sync and generate are independently try/caught. A
 * failure in either is recorded and the loop CONTINUES — one project never aborts
 * the run for the others. syncProject already persists lastSyncError per project.
 */
export async function runDailyUpdate(): Promise<DailyUpdateResult[]> {
  const projects = await prisma.project.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, name: true, cronEnabled: true },
  });

  console.log(`[cron] active projects to process: ${projects.length}`);

  const results: DailyUpdateResult[] = [];

  for (const p of projects) {
    // Structured per-project log line — these land in Vercel function logs.
    const log = (msg: string) => console.log(`[cron] "${p.name}" (${p.id}): ${msg}`);

    const result: DailyUpdateResult = {
      id: p.id,
      name: p.name,
      synced: 0,
      skipped: 0,
      generated: false,
    };

    // 1. Sync — isolated. syncProject persists lastSyncError on throw.
    let synced = 0;
    try {
      const counts = await syncProject(p.id);
      synced = counts.synced;
      result.synced = counts.synced;
      result.skipped = counts.skipped;
      log(`sync ok: synced=${counts.synced} skipped=${counts.skipped} cronEnabled=${p.cronEnabled}`);
    } catch (e: unknown) {
      result.syncError = e instanceof Error ? e.message : String(e);
      // syncProject throws a descriptive message for the token/access guards
      // (missing GITHUB_TOKEN, 401 expired PAT, 403/404 collaborator). Surface it.
      log(`sync FAILED: ${result.syncError}`);
      results.push(result);
      continue; // sync failed → nothing reliable to generate from; next project
    }

    // 2. Generate — gated on (a) new events this sync, (b) auto-updates enabled,
    //    and (c) the 48h cadence (elapsed since this project's last update). Each
    //    skip path logs its reason so a quiet run is distinguishable from a stuck one.
    if (synced === 0) {
      log("skip generation: no new events this sync (synced=0)");
      results.push(result);
      continue;
    }
    if (!p.cronEnabled) {
      result.generateSkipped = "auto-updates disabled (cronEnabled=false)";
      log(`skip generation: ${result.generateSkipped}`);
      results.push(result);
      continue;
    }

    // 48h cadence gate — moved here from the old "*/2" day-of-month cron schedule.
    const lastUpdate = await prisma.contextUpdate.findFirst({
      where: { projectId: p.id },
      orderBy: { generatedAt: "desc" },
      select: { generatedAt: true },
    });
    const hoursSinceLast = lastUpdate
      ? (Date.now() - lastUpdate.generatedAt.getTime()) / 3_600_000
      : Infinity;
    if (hoursSinceLast < MIN_HOURS_BETWEEN_UPDATES) {
      result.generateSkipped = `last update ${hoursSinceLast.toFixed(1)}h ago (<${MIN_HOURS_BETWEEN_UPDATES}h)`;
      log(`skip generation: ${result.generateSkipped}`);
      results.push(result);
      continue;
    }

    log(
      `generating: synced=${synced} hoursSinceLast=` +
        `${Number.isFinite(hoursSinceLast) ? hoursSinceLast.toFixed(1) : "none (first update)"}`
    );
    await prisma.project.update({
      where: { id: p.id },
      data: { cronStatus: "RUNNING" },
    });
    try {
      // Incremental path: NO { manual: true }. Floors on the prior windowEnd,
      // so it never re-summarizes/duplicates; returns no_events (and persists
      // nothing, no AI call) if the incremental window has no events.
      const outcome = await generateUpdate(p.id);
      if (outcome.status === "generated") {
        result.generated = true;
        result.source = outcome.source;
        log(`generated (source=${outcome.source})`);
      } else {
        log(`generateUpdate returned status=${outcome.status} — nothing written`);
      }
    } catch (e: unknown) {
      captureException(e, { projectId: p.id });
      result.generateError = e instanceof Error ? e.message : String(e);
      log(`generation ERROR: ${result.generateError}`);
    } finally {
      await prisma.project.update({
        where: { id: p.id },
        data: { cronStatus: "IDLE" },
      });
    }

    results.push(result);
  }

  return results;
}
