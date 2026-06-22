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
};

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

  const results: DailyUpdateResult[] = [];

  for (const p of projects) {
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
    } catch (e: unknown) {
      result.syncError = e instanceof Error ? e.message : String(e);
      results.push(result);
      continue; // sync failed → nothing reliable to generate from; next project
    }

    // 2. Generate — only when the sync brought new events AND auto-updates are on.
    //    The synced > 0 gate is what prevents an Anthropic call on a quiet day.
    if (synced > 0 && p.cronEnabled) {
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
        }
      } catch (e: unknown) {
        captureException(e, { projectId: p.id });
        result.generateError = e instanceof Error ? e.message : String(e);
      } finally {
        await prisma.project.update({
          where: { id: p.id },
          data: { cronStatus: "IDLE" },
        });
      }
    }

    results.push(result);
  }

  return results;
}
