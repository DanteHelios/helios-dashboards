import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import type { Bullet, ContextUpdateBullets } from "@/lib/types";

const JUNK_COMMIT_RE =
  /^(merge|wip|fixup!|squashed|revert "merge|chore: bump version|update readme$|^\.+$)/i;

function isJunk(title: string): boolean {
  return JUNK_COMMIT_RE.test(title) || title.trim().length < 5;
}

type ProjectForPrompt = {
  name: string;
  client: { name: string };
};

type EventForPrompt = {
  id: string;
  type: string;
  occurredAt: Date;
  title: string;
  body: string | null;
  authorName: string;
  url: string;
};

export function buildPrompt(
  project: ProjectForPrompt,
  readme: string | null,
  events: EventForPrompt[],
  windowStart: Date,
  windowEnd: Date
): string {
  const eventBlock = events
    .map((e) =>
      [
        `[event:${e.id}] ${e.type} on ${e.occurredAt.toISOString()} by ${e.authorName}`,
        `Title: ${e.title}`,
        e.body ? `Body: ${e.body.slice(0, 500)}` : null,
        `URL: ${e.url}`,
      ]
        .filter(Boolean)
        .join("\n")
    )
    .join("\n---\n");

  return `You are writing a project status update for a Helios Marketing client.
Helios is an AI marketing agency. The client reads these bullets directly.

VOICE RULES (from Helios style guide):
- Editorial, confident, direct. No filler. No marketing fluff.
- Outcome-led: what shipped or moved, not what people "worked on."
- Plain about AI: "systems," "pipelines," "automations" — never "magic" or "revolutionary."
- No exclamation marks. No emoji.
- First-person plural ("we shipped," "we kicked off").
- Numbers stay in numerals.
- Title-case for product/feature names; sentence-case otherwise.

PROJECT CONTEXT (do not summarize this, just use it for understanding):
Project name: ${project.name}
Client: ${project.client.name}
README:
"""
${(readme ?? "").slice(0, 2000)}
"""

SCOPE:
- Summarize project activity between ${windowStart.toISOString()} and ${windowEnd.toISOString()}.
- 3–6 bullets. Each bullet = 1–2 sentences.
- EVERY bullet must cite at least one source eventId from the inputs below.
- If there is nothing meaningful to report, return {"bullets": []}.
- Group related events into a single bullet — don't list every commit.

INPUTS (chronologically interleaved):

${eventBlock}

OUTPUT — strict JSON, no prose, no markdown fence:
{
  "bullets": [
    {
      "text": "We shipped the new checkout flow with Apple Pay support.",
      "sources": [{ "eventId": "<id from inputs above>" }]
    }
  ]
}

A bullet without sources, or with an eventId not in the inputs, will be dropped.
Do not invent claims that aren't grounded in the inputs.
Do not include the README in your sources — it's context only.`;
}

export function validateCitations(
  bullets: Bullet[],
  eventIds: Set<string>
): Bullet[] {
  return bullets.filter(
    (b) =>
      Array.isArray(b.sources) &&
      b.sources.length > 0 &&
      b.sources.every((s) => eventIds.has(s.eventId))
  );
}

async function callClaudeWithRetry(
  client: Anthropic,
  prompt: string
): Promise<{ bullets: Bullet[] }> {
  const userMsg: Anthropic.MessageParam = { role: "user", content: prompt };

  const first = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 1024,
    messages: [userMsg],
  });

  const firstBlock = first.content[0];
  if (firstBlock.type !== "text") throw new Error("Non-text response from Claude");
  const firstText = firstBlock.text;

  try {
    return JSON.parse(firstText) as { bullets: Bullet[] };
  } catch {
    // Retry with the bad response in context so Claude can self-correct
    const retry = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 1024,
      messages: [
        userMsg,
        { role: "assistant", content: firstText },
        {
          role: "user",
          content:
            "Your previous response was not valid JSON. Return only the JSON object, no other text.",
        },
      ],
    });

    const retryBlock = retry.content[0];
    if (retryBlock.type !== "text") throw new Error("Non-text response from Claude on retry");
    return JSON.parse(retryBlock.text) as { bullets: Bullet[] };
  }
}

export type GeneratedUpdate = {
  id: string;
  projectId: string;
  bullets: ContextUpdateBullets;
  windowStart: Date;
  windowEnd: Date;
  generatedAt: Date;
  generatedBy: "CRON" | "MANUAL";
};

export async function generateUpdate(
  projectId: string,
  opts?: { manual?: boolean }
): Promise<GeneratedUpdate | null> {
  // 1. Determine window
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      client: { select: { name: true } },
      contextUpdates: {
        orderBy: { generatedAt: "desc" },
        take: 1,
        select: { windowEnd: true },
      },
    },
  });
  if (!project) throw new Error(`Project ${projectId} not found`);

  const windowStart: Date =
    project.contextUpdates[0]?.windowEnd ?? project.startDate;
  const windowEnd = new Date();

  // 2. Fetch and filter events in window
  const rawEvents = await prisma.repoEvent.findMany({
    where: {
      projectId,
      occurredAt: { gte: windowStart, lt: windowEnd },
      type: { in: ["COMMIT", "PR_MERGED", "ISSUE_CLOSED"] },
    },
    orderBy: { occurredAt: "asc" },
    take: 30,
  });

  const events = rawEvents.filter(
    (e) => e.type !== "COMMIT" || !isJunk(e.title)
  );

  // 3. Skip empty windows
  if (events.length === 0) return null;

  const eventIds = new Set(events.map((e) => e.id));

  // 4. Build prompt and call Claude
  const prompt = buildPrompt(
    { name: project.name, client: { name: project.client.name } },
    project.readmeMarkdown,
    events,
    windowStart,
    windowEnd
  );

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const parsed = await callClaudeWithRetry(anthropic, prompt);

  // 5. Validate citations + truncate
  const validBullets = validateCitations(parsed.bullets ?? [], eventIds).slice(0, 6);

  // 6. Skip if no valid bullets survive
  if (validBullets.length === 0) return null;

  // 7. Persist
  const bulletsJson: ContextUpdateBullets = { bullets: validBullets };
  const update = await prisma.contextUpdate.create({
    data: {
      projectId,
      bullets: bulletsJson,
      windowStart,
      windowEnd,
      generatedBy: opts?.manual ? "MANUAL" : "CRON",
    },
  });

  return {
    id: update.id,
    projectId: update.projectId,
    bullets: bulletsJson,
    windowStart: update.windowStart,
    windowEnd: update.windowEnd,
    generatedAt: update.generatedAt,
    generatedBy: update.generatedBy as "CRON" | "MANUAL",
  };
}
