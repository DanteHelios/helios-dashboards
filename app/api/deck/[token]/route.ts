import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const project = await prisma.project.findUnique({
    where: { accessToken: token },
    select: { deckPdfUrl: true, status: true },
  });

  if (!project?.deckPdfUrl || project.status === "ARCHIVED") {
    return new Response("Not found", { status: 404 });
  }

  const upstream = await fetch(project.deckPdfUrl, {
    headers: {
      Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}`,
    },
  });

  if (!upstream.ok) {
    return new Response("Deck unavailable", { status: upstream.status });
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": "inline",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
