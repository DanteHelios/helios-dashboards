import "dotenv/config";
import { PrismaClient } from "../app/generated/prisma";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { subDays, subHours } from "date-fns";

const pool = new Pool({ connectionString: process.env.DIRECT_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const today = new Date();
  const startDate = subDays(today, 60);
  const targetEndDate = subDays(today, -30);

  const client = await prisma.client.upsert({
    where: { id: "seed-client-localboy" },
    update: {},
    create: {
      id: "seed-client-localboy",
      name: "Local Boy Outfitters",
      contactEmail: "demo@localboy.example",
    },
  });

  const project = await prisma.project.upsert({
    where: { accessToken: "demo-token-replace-me-in-prod" },
    update: {},
    create: {
      id: "seed-project-q3content",
      clientId: client.id,
      name: "Q3 Content Engine",
      status: "ACTIVE",
      startDate,
      targetEndDate,
      accessToken: "demo-token-replace-me-in-prod",
      githubRepo: "lucasfigueroa0518/Heliosmarketingwebsite",
      githubBranch: "main",
      readmeMarkdown:
        "## About\n\nThe Q3 Content Engine automates high-volume AI-driven product photography for the Local Boy Outfitters SKU catalog, integrated end-to-end with their Shopify pipeline.\n\nImages are ingested via webhook, processed through a Claude Vision background-removal and quality-scoring loop, and pushed back to Shopify with normalized filenames and alt text.",
    },
  });

  // --- RepoEvents ---

  const e1 = await prisma.repoEvent.upsert({
    where: { projectId_type_externalId: { projectId: project.id, type: "COMMIT", externalId: "a1b2c3d" } },
    update: {},
    create: {
      projectId: project.id,
      type: "COMMIT",
      externalId: "a1b2c3d",
      title: "feat: add Shopify product image import pipeline",
      authorName: "Dante Santurian",
      authorLogin: "dantesanturian",
      authorAvatarUrl: "https://avatars.githubusercontent.com/u/1?v=4",
      url: "https://github.com/lucasfigueroa0518/Heliosmarketingwebsite/commit/a1b2c3d",
      occurredAt: subDays(today, 28),
    },
  });

  const e2 = await prisma.repoEvent.upsert({
    where: { projectId_type_externalId: { projectId: project.id, type: "PR_MERGED", externalId: "3" } },
    update: {},
    create: {
      projectId: project.id,
      type: "PR_MERGED",
      externalId: "3",
      title: "Shopify Integration Phase 1 — product import and webhook setup",
      body: "This PR establishes the foundational Shopify integration. We set up a product import pipeline that pulls the full SKU catalog on initial sync, plus a webhook handler that triggers image processing whenever a new product is created or updated in the merchant's store.\n\nKey decisions: using Shopify Admin API REST (not GraphQL) for simpler cursor-based pagination on large catalogs; webhook signature verification with HMAC-SHA256.",
      authorName: "Dante Santurian",
      authorLogin: "dantesanturian",
      authorAvatarUrl: "https://avatars.githubusercontent.com/u/1?v=4",
      url: "https://github.com/lucasfigueroa0518/Heliosmarketingwebsite/pull/3",
      occurredAt: subDays(today, 26),
      meta: { mergedSha: "a1b2c3d", baseBranch: "main", additions: 412, deletions: 18 },
    },
  });

  const e3 = await prisma.repoEvent.upsert({
    where: { projectId_type_externalId: { projectId: project.id, type: "COMMIT", externalId: "d4e5f6a" } },
    update: {},
    create: {
      projectId: project.id,
      type: "COMMIT",
      externalId: "d4e5f6a",
      title: "feat: implement Claude Vision-based background removal for SKUs",
      authorName: "Dante Santurian",
      authorLogin: "dantesanturian",
      authorAvatarUrl: "https://avatars.githubusercontent.com/u/1?v=4",
      url: "https://github.com/lucasfigueroa0518/Heliosmarketingwebsite/commit/d4e5f6a",
      occurredAt: subDays(today, 25),
    },
  });

  const e4 = await prisma.repoEvent.upsert({
    where: { projectId_type_externalId: { projectId: project.id, type: "ISSUE_CLOSED", externalId: "4" } },
    update: {},
    create: {
      projectId: project.id,
      type: "ISSUE_CLOSED",
      externalId: "4",
      title: "Background removal fails on transparent PNGs",
      authorName: "Lucas Figueroa",
      authorLogin: "lucasfigueroa0518",
      authorAvatarUrl: "https://avatars.githubusercontent.com/u/2?v=4",
      url: "https://github.com/lucasfigueroa0518/Heliosmarketingwebsite/issues/4",
      occurredAt: subDays(today, 23),
      meta: { labels: ["bug"], stateReason: "completed" },
    },
  });

  const e5 = await prisma.repoEvent.upsert({
    where: { projectId_type_externalId: { projectId: project.id, type: "COMMIT", externalId: "b7c8d9e" } },
    update: {},
    create: {
      projectId: project.id,
      type: "COMMIT",
      externalId: "b7c8d9e",
      title: "fix: resolve race condition in batch image processor",
      authorName: "Dante Santurian",
      authorLogin: "dantesanturian",
      authorAvatarUrl: "https://avatars.githubusercontent.com/u/1?v=4",
      url: "https://github.com/lucasfigueroa0518/Heliosmarketingwebsite/commit/b7c8d9e",
      occurredAt: subDays(today, 22),
    },
  });

  const e6 = await prisma.repoEvent.upsert({
    where: { projectId_type_externalId: { projectId: project.id, type: "COMMIT", externalId: "e0f1a2b" } },
    update: {},
    create: {
      projectId: project.id,
      type: "COMMIT",
      externalId: "e0f1a2b",
      title: "feat: add webhook handler for Shopify new product events",
      authorName: "Dante Santurian",
      authorLogin: "dantesanturian",
      authorAvatarUrl: "https://avatars.githubusercontent.com/u/1?v=4",
      url: "https://github.com/lucasfigueroa0518/Heliosmarketingwebsite/commit/e0f1a2b",
      occurredAt: subDays(today, 19),
    },
  });

  const e7 = await prisma.repoEvent.upsert({
    where: { projectId_type_externalId: { projectId: project.id, type: "PR_MERGED", externalId: "7" } },
    update: {},
    create: {
      projectId: project.id,
      type: "PR_MERGED",
      externalId: "7",
      title: "AI Image Pipeline — background removal and quality scoring",
      body: "Ships the core AI loop: Claude Vision processes each incoming SKU image, removes the background, and scores the result on a 1–10 quality scale. Images scoring below 7 are queued for a second pass with adjusted prompting.\n\nAlso fixes the transparent PNG crash (issue #4) — we now convert RGBA to RGB before submission to the Vision API.\n\nBenchmark: median processing time 2.3s/image at 95th percentile, well within the Shopify 10s webhook timeout.",
      authorName: "Dante Santurian",
      authorLogin: "dantesanturian",
      authorAvatarUrl: "https://avatars.githubusercontent.com/u/1?v=4",
      url: "https://github.com/lucasfigueroa0518/Heliosmarketingwebsite/pull/7",
      occurredAt: subDays(today, 18),
      meta: { mergedSha: "d4e5f6a", baseBranch: "main", additions: 631, deletions: 44 },
    },
  });

  const e8 = await prisma.repoEvent.upsert({
    where: { projectId_type_externalId: { projectId: project.id, type: "ISSUE_CLOSED", externalId: "9" } },
    update: {},
    create: {
      projectId: project.id,
      type: "ISSUE_CLOSED",
      externalId: "9",
      title: "Shopify webhook signature verification missing",
      authorName: "Lucas Figueroa",
      authorLogin: "lucasfigueroa0518",
      authorAvatarUrl: "https://avatars.githubusercontent.com/u/2?v=4",
      url: "https://github.com/lucasfigueroa0518/Heliosmarketingwebsite/issues/9",
      occurredAt: subDays(today, 17),
      meta: { labels: ["enhancement"], stateReason: "completed" },
    },
  });

  const e9 = await prisma.repoEvent.upsert({
    where: { projectId_type_externalId: { projectId: project.id, type: "COMMIT", externalId: "c3d4e5f" } },
    update: {},
    create: {
      projectId: project.id,
      type: "COMMIT",
      externalId: "c3d4e5f",
      title: "chore: migrate image storage from local disk to Supabase Storage",
      authorName: "Dante Santurian",
      authorLogin: "dantesanturian",
      authorAvatarUrl: "https://avatars.githubusercontent.com/u/1?v=4",
      url: "https://github.com/lucasfigueroa0518/Heliosmarketingwebsite/commit/c3d4e5f",
      occurredAt: subDays(today, 14),
    },
  });

  const e10 = await prisma.repoEvent.upsert({
    where: { projectId_type_externalId: { projectId: project.id, type: "PR_MERGED", externalId: "11" } },
    update: {},
    create: {
      projectId: project.id,
      type: "PR_MERGED",
      externalId: "11",
      title: "Storage Migration — move from local disk to Supabase Storage",
      body: "Migrates all processed image storage from ephemeral local disk (which was causing issues on Vercel's stateless functions) to Supabase Storage. Images are now stored at a stable public URL that gets written directly to Shopify's media endpoint.\n\nIncludes a one-time migration script that back-fills the 847 images processed to date.",
      authorName: "Dante Santurian",
      authorLogin: "dantesanturian",
      authorAvatarUrl: "https://avatars.githubusercontent.com/u/1?v=4",
      url: "https://github.com/lucasfigueroa0518/Heliosmarketingwebsite/pull/11",
      occurredAt: subDays(today, 12),
      meta: { mergedSha: "c3d4e5f", baseBranch: "main", additions: 289, deletions: 176 },
    },
  });

  const e11 = await prisma.repoEvent.upsert({
    where: { projectId_type_externalId: { projectId: project.id, type: "COMMIT", externalId: "f6a7b8c" } },
    update: {},
    create: {
      projectId: project.id,
      type: "COMMIT",
      externalId: "f6a7b8c",
      title: "fix: handle Shopify API rate limits with exponential backoff",
      authorName: "Dante Santurian",
      authorLogin: "dantesanturian",
      authorAvatarUrl: "https://avatars.githubusercontent.com/u/1?v=4",
      url: "https://github.com/lucasfigueroa0518/Heliosmarketingwebsite/commit/f6a7b8c",
      occurredAt: subDays(today, 9),
    },
  });

  const e12 = await prisma.repoEvent.upsert({
    where: { projectId_type_externalId: { projectId: project.id, type: "ISSUE_CLOSED", externalId: "13" } },
    update: {},
    create: {
      projectId: project.id,
      type: "ISSUE_CLOSED",
      externalId: "13",
      title: "Add retry logic for failed image processing jobs",
      authorName: "Lucas Figueroa",
      authorLogin: "lucasfigueroa0518",
      authorAvatarUrl: "https://avatars.githubusercontent.com/u/2?v=4",
      url: "https://github.com/lucasfigueroa0518/Heliosmarketingwebsite/issues/13",
      occurredAt: subDays(today, 8),
      meta: { labels: ["enhancement"], stateReason: "completed" },
    },
  });

  const e13 = await prisma.repoEvent.upsert({
    where: { projectId_type_externalId: { projectId: project.id, type: "COMMIT", externalId: "d9e0f1a" } },
    update: {},
    create: {
      projectId: project.id,
      type: "COMMIT",
      externalId: "d9e0f1a",
      title: "feat: add bulk export endpoint for processed image catalog",
      authorName: "Dante Santurian",
      authorLogin: "dantesanturian",
      authorAvatarUrl: "https://avatars.githubusercontent.com/u/1?v=4",
      url: "https://github.com/lucasfigueroa0518/Heliosmarketingwebsite/commit/d9e0f1a",
      occurredAt: subDays(today, 6),
    },
  });

  const e14 = await prisma.repoEvent.upsert({
    where: { projectId_type_externalId: { projectId: project.id, type: "PR_MERGED", externalId: "15" } },
    update: {},
    create: {
      projectId: project.id,
      type: "PR_MERGED",
      externalId: "15",
      title: "Bulk Export API + Rate Limit Resilience",
      body: "Two features shipped together:\n\n1. **Bulk Export API**: `/api/export/catalog` returns a paginated, filterable JSON feed of all processed SKUs with their image URLs and quality scores. Lucas can pull this directly into reporting dashboards.\n\n2. **Rate Limit Resilience**: wraps all Shopify API calls in an exponential backoff loop (max 5 retries, base delay 500ms). Fixes the silent failures that were dropping ~3% of high-volume sync jobs.",
      authorName: "Dante Santurian",
      authorLogin: "dantesanturian",
      authorAvatarUrl: "https://avatars.githubusercontent.com/u/1?v=4",
      url: "https://github.com/lucasfigueroa0518/Heliosmarketingwebsite/pull/15",
      occurredAt: subDays(today, 4),
      meta: { mergedSha: "d9e0f1a", baseBranch: "main", additions: 518, deletions: 62 },
    },
  });

  const e15 = await prisma.repoEvent.upsert({
    where: { projectId_type_externalId: { projectId: project.id, type: "COMMIT", externalId: "a2b3c4d" } },
    update: {},
    create: {
      projectId: project.id,
      type: "COMMIT",
      externalId: "a2b3c4d",
      title: "feat: add image quality scoring with Claude feedback loop",
      authorName: "Dante Santurian",
      authorLogin: "dantesanturian",
      authorAvatarUrl: "https://avatars.githubusercontent.com/u/1?v=4",
      url: "https://github.com/lucasfigueroa0518/Heliosmarketingwebsite/commit/a2b3c4d",
      occurredAt: subDays(today, 2),
    },
  });

  // --- ContextUpdates ---

  // Window 1: days -60 to -30 (earliest)
  await prisma.contextUpdate.upsert({
    where: { id: "seed-update-1" },
    update: {},
    create: {
      id: "seed-update-1",
      projectId: project.id,
      windowStart: subDays(today, 60),
      windowEnd: subDays(today, 30),
      generatedAt: subDays(today, 29),
      generatedBy: "CRON",
      bullets: {
        bullets: [
          {
            text: "We launched the Shopify product import pipeline, establishing the foundational integration that pulls the full SKU catalog on initial sync.",
            sources: [{ eventId: e1.id }],
          },
          {
            text: "Webhook handling for new product events shipped alongside HMAC-SHA256 signature verification, closing the security gap flagged in issue #9.",
            sources: [{ eventId: e2.id }, { eventId: e8.id }],
          },
          {
            text: "The core AI image processing loop went live — Claude Vision now handles background removal and quality scoring for every incoming SKU.",
            sources: [{ eventId: e3.id }, { eventId: e7.id }],
          },
          {
            text: "A crash affecting transparent PNGs (issue #4) was identified and resolved within 48 hours of discovery — RGBA images are now converted before submission to the Vision API.",
            sources: [{ eventId: e4.id }, { eventId: e7.id }],
          },
        ],
      },
    },
  });

  // Window 2: days -30 to -10
  await prisma.contextUpdate.upsert({
    where: { id: "seed-update-2" },
    update: {},
    create: {
      id: "seed-update-2",
      projectId: project.id,
      windowStart: subDays(today, 30),
      windowEnd: subDays(today, 10),
      generatedAt: subDays(today, 9),
      generatedBy: "CRON",
      bullets: {
        bullets: [
          {
            text: "We migrated all processed image storage from ephemeral local disk to Supabase Storage, resolving the instability on Vercel's stateless functions and back-filling 847 previously processed images.",
            sources: [{ eventId: e9.id }, { eventId: e10.id }],
          },
          {
            text: "A race condition in the batch image processor was identified and patched — the fix prevents duplicate processing jobs from queuing when Shopify sends rapid-fire webhook events.",
            sources: [{ eventId: e5.id }],
          },
          {
            text: "Retry logic with exponential backoff now wraps all Shopify API calls, eliminating the ~3% silent drop rate on high-volume sync jobs that was discovered in issue #13.",
            sources: [{ eventId: e11.id }, { eventId: e12.id }],
          },
        ],
      },
    },
  });

  // Window 3: days -10 to today (latest)
  await prisma.contextUpdate.upsert({
    where: { id: "seed-update-3" },
    update: {},
    create: {
      id: "seed-update-3",
      projectId: project.id,
      windowStart: subDays(today, 10),
      windowEnd: today,
      generatedAt: subHours(today, 2),
      generatedBy: "CRON",
      bullets: {
        bullets: [
          {
            text: "The Bulk Export API is live at `/api/export/catalog`, returning a paginated, filterable JSON feed of all processed SKUs with image URLs and quality scores — ready to pipe into reporting dashboards.",
            sources: [{ eventId: e13.id }, { eventId: e14.id }],
          },
          {
            text: "We shipped a Claude-powered quality feedback loop that automatically queues low-scoring images (below 7/10) for a second processing pass with adjusted prompting.",
            sources: [{ eventId: e15.id }],
          },
          {
            text: "The project hit a milestone: all 847 historical SKUs are now fully processed, stored, and surfaced via the export API — zero manual intervention required.",
            sources: [{ eventId: e10.id }, { eventId: e14.id }],
          },
        ],
      },
    },
  });

  console.log("Seed complete.");
  console.log(`Client: ${client.name}`);
  console.log(`Project: ${project.name} — /d/${project.accessToken}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
