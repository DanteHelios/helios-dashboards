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

// Discriminated outcome so callers can surface WHY nothing AI-generated happened,
// instead of a bare null that always renders the welcome placeholder.
export type GenerateOutcome =
  | {
      status: "no_events";
      hasPriorUpdate: boolean;
      windowStart: Date;
      windowEnd: Date;
    }
  | {
      status: "generated";
      update: GeneratedUpdate;
      source: "ai" | "fallback";
      // Populated when source === "fallback": the reason the AI summary was not used.
      aiError?: string;
    };

const EVENT_LABEL: Record<string, string> = {
  COMMIT: "Commit",
  PR_MERGED: "Merged PR",
  ISSUE_CLOSED: "Closed issue",
  RELEASE: "Release",
};

// Non-AI fallback: one bullet per event, "<Type>: <title>", citing the event itself.
// Guarantees a real, visible update whenever there are events to summarize.
export function buildFallbackBullets(
  events: { id: string; type: string; title: string }[]
): Bullet[] {
  return events.slice(0, 6).map((e) => ({
    text: `${EVENT_LABEL[e.type] ?? e.type}: ${e.title}`,
    sources: [{ eventId: e.id }],
  }));
}

export async function generateUpdate(
  projectId: string,
  opts?: { manual?: boolean }
): Promise<GenerateOutcome> {
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

  // Window: the FIRST generation has no lower bound. Synced history routinely
  // predates onboarding (createdAt) and contract start (startDate) — sync backfills
  // ~30 days, so for a project added mid-stream the real activity sits BEFORE any
  // onboarding date. Flooring on such a date silently hides every event (the bug
  // we kept hitting). Subsequent generations only take events after the last window
  // so we never re-summarize. windowStart on the persisted record is the last
  // window end, else the earliest event we actually summarized, else createdAt.
  const hasPriorUpdate = Boolean(project.contextUpdates[0]);
  const priorWindowEnd: Date | null =
    project.contextUpdates[0]?.windowEnd ?? null;
  const windowEnd = new Date();

  // 2. Fetch and filter events
  const rawEvents = await prisma.repoEvent.findMany({
    where: {
      projectId,
      type: { in: ["COMMIT", "PR_MERGED", "ISSUE_CLOSED"] },
      occurredAt: priorWindowEnd
        ? { gte: priorWindowEnd, lt: windowEnd }
        : { lt: windowEnd },
    },
    orderBy: { occurredAt: "asc" },
    take: 30,
  });

  // TEMP DEBUG
  console.log("[generateUpdate] rawEvents query", {
    projectId,
    isFirstGeneration: !hasPriorUpdate,
    priorWindowEnd: priorWindowEnd?.toISOString() ?? null,
    windowEnd: windowEnd.toISOString(),
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

  // 3. Genuinely nothing to summarize — the only path that persists nothing.
  if (events.length === 0) {
    const emptyWindowStart = priorWindowEnd ?? project.createdAt;
    console.log("[generateUpdate] no events to summarize", {
      priorWindowEnd: priorWindowEnd?.toISOString() ?? null,
      windowEnd: windowEnd.toISOString(),
    });
    return {
      status: "no_events",
      hasPriorUpdate,
      windowStart: emptyWindowStart,
      windowEnd,
    };
  }

  // Effective window start now that we know the events we're summarizing.
  const windowStart: Date =
    priorWindowEnd ?? events[0].occurredAt ?? project.createdAt;

  const eventIds = new Set(events.map((e) => e.id));

  // 4. Try the AI summary. Any failure (throw, malformed JSON, empty bullets) is
  // captured as aiError and we fall through to a deterministic non-AI summary —
  // something visible always beats a silent welcome placeholder.
  let bullets: Bullet[] = [];
  let aiError: string | undefined;
  try {
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
      hasApiKey: Boolean(process.env.ANTHROPIC_API_KEY),
    });

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const parsed = await callClaudeWithRetry(anthropic, prompt);

    // TEMP DEBUG
    console.log("[generateUpdate] parsed Claude response", {
      rawBullets: JSON.stringify(parsed.bullets ?? null),
    });

    bullets = sanitizeBullets(parsed.bullets ?? [], eventIds).slice(0, 6);
    if (bullets.length === 0) {
      aiError = "Claude returned no usable bullets";
    }
  } catch (e: unknown) {
    aiError = e instanceof Error ? e.message : String(e);
    console.error("[generateUpdate] Anthropic call failed:", aiError);
  }

  // 5. Fall back to a non-AI summary if the AI produced nothing usable.
  let source: "ai" | "fallback" = "ai";
  if (bullets.length === 0) {
    bullets = buildFallbackBullets(events);
    source = "fallback";
    console.log("[generateUpdate] using non-AI fallback summary", {
      reason: aiError,
      fallbackBullets: bullets.length,
    });
  }

  // 6. Persist — guaranteed non-empty here (events.length > 0).
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

  console.log("[generateUpdate] persisted update", { id: update.id, source });

  return {
    status: "generated",
    source,
    aiError,
    update: {
      id: update.id,
      projectId: update.projectId,
      bullets: bulletsJson,
      windowStart: update.windowStart,
      windowEnd: update.windowEnd,
      generatedAt: update.generatedAt,
      generatedBy: update.generatedBy as "CRON" | "MANUAL",
    },
  };
}
