"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Octokit } from "@octokit/rest";
import { put, del } from "@vercel/blob";
import { prisma } from "@/lib/prisma";

export type ActionState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

// Parse "owner/repo" or full GitHub URL → { owner, repo } | null
function parseGithubRepo(input: string): { owner: string; repo: string } | null {
  const trimmed = input.trim().replace(/\.git$/, "");
  const urlMatch = trimmed.match(/github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)/);
  if (urlMatch) return { owner: urlMatch[1], repo: urlMatch[2] };
  const parts = trimmed.split("/");
  if (parts.length === 2 && parts[0] && parts[1]) return { owner: parts[0], repo: parts[1] };
  return null;
}

async function validateRepo(repoInput: string): Promise<{ repoSlug: string } | { error: string }> {
  const parsed = parseGithubRepo(repoInput);
  if (!parsed) {
    return { error: "Invalid repo format. Use 'owner/repo' or a full GitHub URL." };
  }

  const githubToken = process.env.GITHUB_TOKEN;
  if (!githubToken) {
    return { repoSlug: `${parsed.owner}/${parsed.repo}` };
  }

  try {
    const octokit = new Octokit({ auth: githubToken });
    await octokit.repos.get({ owner: parsed.owner, repo: parsed.repo });
    return { repoSlug: `${parsed.owner}/${parsed.repo}` };
  } catch (err: unknown) {
    if ((err as { status?: number }).status === 404) {
      return {
        error:
          "Repo not found or not accessible. Check the URL and invite @helios-dashboards-bot as a Read collaborator.",
      };
    }
    return { error: "Could not verify repo access. Check that GITHUB_TOKEN is valid." };
  }
}

// Resolve or create client: if clientId provided → use it; else create with clientName
async function resolveClient(
  clientId: string | null,
  clientName: string | null
): Promise<{ id: string } | { error: string }> {
  if (clientId) {
    const existing = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true } });
    if (existing) return { id: existing.id };
  }
  if (clientName?.trim()) {
    const created = await prisma.client.create({
      data: { name: clientName.trim() },
      select: { id: true },
    });
    return { id: created.id };
  }
  return { error: "Client is required." };
}

export async function createProject(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const name = (formData.get("name") as string)?.trim();
  const clientId = (formData.get("clientId") as string) || null;
  const clientName = (formData.get("clientName") as string) || null;
  const githubRepoRaw = (formData.get("githubRepo") as string)?.trim();
  const githubBranch = ((formData.get("githubBranch") as string)?.trim()) || "main";
  const startDateStr = formData.get("startDate") as string;
  const targetEndDateStr = formData.get("targetEndDate") as string;
  const status = (formData.get("status") as string) || "ACTIVE";

  if (!name) return { fieldErrors: { name: "Project name is required." } };
  if (!githubRepoRaw) return { fieldErrors: { githubRepo: "GitHub repo is required." } };
  if (!startDateStr) return { fieldErrors: { startDate: "Start date is required." } };
  if (!targetEndDateStr) return { fieldErrors: { targetEndDate: "Target end date is required." } };

  const repoResult = await validateRepo(githubRepoRaw);
  if ("error" in repoResult) return { fieldErrors: { githubRepo: repoResult.error } };

  const clientResult = await resolveClient(clientId, clientName);
  if ("error" in clientResult) return { fieldErrors: { clientId: clientResult.error } };

  const startDate = new Date(startDateStr);
  const targetEndDate = new Date(targetEndDateStr);
  if (isNaN(startDate.getTime())) return { fieldErrors: { startDate: "Invalid start date." } };
  if (isNaN(targetEndDate.getTime())) return { fieldErrors: { targetEndDate: "Invalid target end date." } };
  if (targetEndDate <= startDate) return { fieldErrors: { targetEndDate: "Target end date must be after start date." } };

  const accessToken = randomBytes(32).toString("base64url");

  const project = await prisma.project.create({
    data: {
      name,
      clientId: clientResult.id,
      status: status as "ACTIVE" | "PAUSED" | "COMPLETE" | "ARCHIVED",
      startDate,
      targetEndDate,
      accessToken,
      githubRepo: repoResult.repoSlug,
      githubBranch,
    },
  });

  revalidatePath("/admin");
  redirect(`/admin/projects/${project.id}`);
}

export async function updateProject(
  id: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const name = (formData.get("name") as string)?.trim();
  const clientId = (formData.get("clientId") as string) || null;
  const clientName = (formData.get("clientName") as string) || null;
  const githubRepoRaw = (formData.get("githubRepo") as string)?.trim();
  const githubBranch = ((formData.get("githubBranch") as string)?.trim()) || "main";
  const startDateStr = formData.get("startDate") as string;
  const targetEndDateStr = formData.get("targetEndDate") as string;
  const status = formData.get("status") as string;
  const completedAtStr = formData.get("completedAt") as string;

  if (!name) return { fieldErrors: { name: "Project name is required." } };
  if (!githubRepoRaw) return { fieldErrors: { githubRepo: "GitHub repo is required." } };

  const repoResult = await validateRepo(githubRepoRaw);
  if ("error" in repoResult) return { fieldErrors: { githubRepo: repoResult.error } };

  const clientResult = await resolveClient(clientId, clientName);
  if ("error" in clientResult) return { fieldErrors: { clientId: clientResult.error } };

  const startDate = new Date(startDateStr);
  const targetEndDate = new Date(targetEndDateStr);
  if (isNaN(startDate.getTime())) return { fieldErrors: { startDate: "Invalid start date." } };
  if (isNaN(targetEndDate.getTime())) return { fieldErrors: { targetEndDate: "Invalid target end date." } };

  const completedAt =
    status === "COMPLETE" && completedAtStr ? new Date(completedAtStr) : null;

  await prisma.project.update({
    where: { id },
    data: {
      name,
      clientId: clientResult.id,
      status: status as "ACTIVE" | "PAUSED" | "COMPLETE" | "ARCHIVED",
      startDate,
      targetEndDate,
      completedAt,
      githubRepo: repoResult.repoSlug,
      githubBranch,
    },
  });

  revalidatePath(`/admin/projects/${id}`);
  revalidatePath("/admin");
  return {};
}

export async function regenerateToken(id: string): Promise<{ newToken: string }> {
  const newToken = randomBytes(32).toString("base64url");
  await prisma.project.update({ where: { id }, data: { accessToken: newToken } });
  revalidatePath(`/admin/projects/${id}`);
  revalidatePath("/admin");
  return { newToken };
}

const MAX_DECK_BYTES = 25 * 1024 * 1024;

export async function uploadDeck(
  id: string,
  formData: FormData
): Promise<{ url: string } | { error: string }> {
  const file = formData.get("deck") as File | null;
  if (!file || file.size === 0) return { error: "No file selected." };
  if (file.type !== "application/pdf") return { error: "File must be a PDF." };
  if (file.size > MAX_DECK_BYTES) {
    return { error: `File must be 25 MB or smaller (got ${(file.size / 1024 / 1024).toFixed(1)} MB).` };
  }

  const filename = `decks/${id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const blob = await put(filename, file, { access: "public" });

  await prisma.project.update({ where: { id }, data: { deckPdfUrl: blob.url } });
  revalidatePath(`/admin/projects/${id}`);
  revalidatePath("/admin");
  return { url: blob.url };
}

export async function removeDeck(id: string, existingUrl: string | null): Promise<void> {
  if (existingUrl) {
    try {
      await del(existingUrl);
    } catch {
      // Non-fatal — still clear the DB reference
    }
  }
  await prisma.project.update({ where: { id }, data: { deckPdfUrl: null } });
  revalidatePath(`/admin/projects/${id}`);
  revalidatePath("/admin");
}
