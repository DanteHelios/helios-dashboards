import { NextRequest, NextResponse } from "next/server";
import { runDailyUpdate } from "@/lib/daily-update";

export const dynamic = "force-dynamic";
// Sequential sync (+ paginated GitHub calls) and one AI call per active project
// with new activity. Generous headroom over the old 60s.
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const startedAt = Date.now();
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    // Never log the secret itself — only that it is absent.
    console.error("[cron] auth: CRON_SECRET not configured — rejecting");
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  if (req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    console.warn("[cron] auth: rejected (missing/mismatched bearer token)");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  console.log("[cron] auth: passed — starting daily update run");

  const results = await runDailyUpdate();
  const totalSynced = results.reduce((sum, r) => sum + r.synced, 0);
  const totalGenerated = results.filter((r) => r.generated).length;
  const errors = results.filter((r) => r.syncError || r.generateError);

  console.log(
    `[cron] run complete: projects=${results.length} totalSynced=${totalSynced} ` +
      `totalGenerated=${totalGenerated} errors=${errors.length} durationMs=${Date.now() - startedAt}`
  );
  if (errors.length > 0) {
    for (const r of errors) {
      console.error(
        `[cron] project "${r.name}" (${r.id}) error: ` +
          `sync=${r.syncError ?? "none"} generate=${r.generateError ?? "none"}`
      );
    }
  }

  return NextResponse.json({
    ok: errors.length === 0,
    totalSynced,
    totalGenerated,
    projects: results,
  });
}
