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
- Cite at least one source eventId from the inputs below for each bullet where you can.
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

Cite source eventIds where you can; any eventId you cite must come from the inputs above — do not invent eventIds.
Do not invent claims that aren't grounded in the inputs.
Do not include the README in your sources — it's context only.`;
}

// Keep every bullet that has real text. Strip only the sources whose eventId
// wasn't in the inputs (prevents linking to hallucinated/unknown events).
// A soft, unlinked summary is better than discarding the whole update.
export function sanitizeBullets(
  bullets: Bullet[],
  eventIds: Set<string>
): Bullet[] {
  return bullets
    .filter((b) => typeof b.text === "string" && b.text.trim().length > 0)
    .map((b) => ({
      text: b.text,
      sources: Array.isArray(b.sources)
        ? b.sources.filter((s) => eventIds.has(s.eventId))
        : [],
    }));
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

  // First generation floors on createdAt (when the project was onboarded to Helios
  // Dashboards), NOT startDate (the contract-start business field). Conflating them
  // silently breaks first generation for projects added mid-stream, whose synced
  // activity can predate startDate. Subsequent generations continue from the last
  // update's windowEnd.
  const windowStart: Date =
    project.contextUpdates[0]?.windowEnd ?? project.createdAt;
  const windowEnd = new Date();

  // TEMP DEBUG
  console.log("[generateUpdate] window", {
    projectId,
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
    isFirstGeneration: !project.contextUpdates[0],
  });

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

  // TEMP DEBUG
  console.log("[generateUpdate] rawEvents query", {
    rawCount: rawEvents.length,
    firstEventId: rawEvents[0]?.id ?? null,
    firstEventOccurredAt: rawEvents[0]?.occurredAt.toISOString() ?? null,
  });

  const events = rawEvents.filter(
    (e) => e.type !== "COMMIT" || !isJunk(e.title)
  );

  // TEMP DEBUG
  console.log("[generateUpdate] after junk filter", {
    survived: events.length,
    droppedAsJunk: rawEvents.length - events.length,
  });

  // 3. Skip empty windows
  if (events.length === 0) {
    // TEMP DEBUG
    console.log("[generateUpdate] RETURN NULL — guard A: no events in window after junk filter");
    return null;
  }

  const eventIds = new Set(events.map((e) => e.id));

  // 4. Build prompt and call Claude
  const prompt = buildPrompt(
    { name: project.name, client: { name: project.client.name } },
    project.readmeMarkdown,
    events,
    windowStart,
    windowEnd
  );

  // TEMP DEBUG
  console.log("[generateUpdate] before Anthropic call", {
    promptLength: prompt.length,
    eventCount: events.length,
  });

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const parsed = await callClaudeWithRetry(anthropic, prompt);

  // TEMP DEBUG
  console.log("[generateUpdate] parsed Claude response", {
    rawBullets: JSON.stringify(parsed.bullets ?? null),
  });

  // 5. Sanitize bullets: keep all real text, strip only unknown/hallucinated sources
  const bullets = sanitizeBullets(parsed.bullets ?? [], eventIds).slice(0, 6);

  // 6. Skip only if the model had genuinely nothing to report
  if (bullets.length === 0) {
    // TEMP DEBUG
    console.log("[generateUpdate] RETURN NULL — guard B: no bullets survived sanitize (model returned no usable text)");
    return null;
  }

  // 7. Persist
  const bulletsJson: ContextUpdateBullets = { bullets };
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
