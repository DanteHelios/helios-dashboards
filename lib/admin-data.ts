import { differenceInCalendarDays } from "date-fns";
import { prisma } from "./prisma";

export async function getAdminProjects() {
  const projects = await prisma.project.findMany({
    include: {
      client: { select: { id: true, name: true } },
      contextUpdates: {
        orderBy: { generatedAt: "desc" },
        take: 1,
        select: { generatedAt: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return projects.map((p) => ({
    ...p,
    daysRemaining: differenceInCalendarDays(p.targetEndDate, new Date()),
    lastUpdateAt: p.contextUpdates[0]?.generatedAt ?? null,
  }));
}

export async function getAdminProject(id: string) {
  return prisma.project.findUnique({
    where: { id },
    include: { client: true },
  });
}

export async function getAllClients() {
  return prisma.client.findMany({ orderBy: { name: "asc" } });
}
