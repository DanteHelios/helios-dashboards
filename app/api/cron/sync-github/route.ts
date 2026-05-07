import { NextRequest, NextResponse } from "next/server";
import { syncAllActiveProjects } from "@/lib/github-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  if (req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = await syncAllActiveProjects();
  const totalSynced = results.reduce((sum, r) => sum + r.synced, 0);
  const errors = results.filter((r) => r.error);

  return NextResponse.json({ ok: errors.length === 0, totalSynced, projects: results });
}
