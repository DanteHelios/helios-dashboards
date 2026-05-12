import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateUpdate } from "@/lib/ai";
import { captureException } from "@/lib/monitoring";

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

  const projects = await prisma.project.findMany({
    where: { status: "ACTIVE", cronEnabled: true },
    select: { id: true, name: true },
  });

  const results = [];
  for (const p of projects) {
    await prisma.project.update({
      where: { id: p.id },
      data: { cronStatus: "RUNNING" },
    });
    try {
      const update = await generateUpdate(p.id);
      console.log("[cron] generate-updates heartbeat", {
        projectId: p.id,
        generated: !!update,
      });
      results.push({ id: p.id, name: p.name, generated: !!update });
    } catch (e: unknown) {
      captureException(e, { projectId: p.id });
      results.push({ id: p.id, name: p.name, generated: false, error: String(e) });
    } finally {
      await prisma.project.update({
        where: { id: p.id },
        data: { cronStatus: "IDLE" },
      });
    }
  }

  return NextResponse.json({ ok: true, projects: results });
}
