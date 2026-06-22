import { NextRequest, NextResponse } from "next/server";
import { runDailyUpdate } from "@/lib/daily-update";

export const dynamic = "force-dynamic";
// Sequential sync (+ paginated GitHub calls) and one AI call per active project
// with new activity. Generous headroom over the old 60s.
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  if (req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = await runDailyUpdate();
  const totalSynced = results.reduce((sum, r) => sum + r.synced, 0);
  const totalGenerated = results.filter((r) => r.generated).length;
  const errors = results.filter((r) => r.syncError || r.generateError);

  return NextResponse.json({
    ok: errors.length === 0,
    totalSynced,
    totalGenerated,
    projects: results,
  });
}
