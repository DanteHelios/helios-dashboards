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

OUTPUT — respond with raw JSON only. Do not wrap the response in markdown code
fences (no \`\`\`json or \`\`\`) and do not add any text before or after the JSON:
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

// Claude sometimes wraps JSON in markdown code fences (```json ... ```) or adds
// a sentence before/after, despite the prompt asking for raw JSON. Strip fences
// and, failing that, parse the substring from the first "{" to the last "}".
export function parseClaudeJson(text: string): { bullets: Bullet[] } {
  const trimmed = text.trim();

  // 1. Try the raw text as-is (the happy path).
  try {
    return JSON.parse(trimmed) as { bullets: Bullet[] };
  } catch {
    // fall through
  }

  // 2. Strip a leading/trailing markdown code fence (```json ... ``` or ``` ... ```).
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1].trim()) as { bullets: Bullet[] };
    } catch {
      // fall through
    }
  }

  // 3. Last resort: grab everything between the first "{" and last "}".
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start !== -1 && end > start) {
    return JSON.parse(trimmed.slice(start, end + 1)) as { bullets: Bullet[] };
  }

  throw new Error("No JSON object found in Claude response");
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
    return parseClaudeJson(firstText);
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
    return parseClaudeJson(retryBlock.text);
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

  // Window selection:
  // - Manual "Generate now" ALWAYS summarizes a fresh last-14-days window (matching
  //   what Recent Activity shows) and ignores the previous update's windowEnd. Clicking
  //   twice produces two updates over the same activity — explicit user intent.
  // - Cron's FIRST generation has no lower bound: synced history routinely predates
  //   onboarding (createdAt) and contract start (startDate) — flooring on such a date
  //   silently hides every event. Subsequent cron runs floor on the last window end so
  //   we never auto-duplicate.
  const manual = opts?.manual ?? false;
  const hasPriorUpdate = Boolean(project.contextUpdates[0]);
  const priorWindowEnd: Date | null = manual
    ? null
    : project.contextUpdates[0]?.windowEnd ?? null;
  const windowEnd = new Date();
  const fourteenDaysAgo = new Date(windowEnd.getTime() - 14 * 24 * 60 * 60 * 1000);
  // Lower bound on event.occurredAt: 14 days for manual, last window for cron,
  // unbounded for the first cron generation.
  const lowerBound: Date | null = manual ? fourteenDaysAgo : priorWindowEnd;

  // 2. Fetch and filter events
  const rawEvents = await prisma.repoEvent.findMany({
    where: {
      projectId,
      type: { in: ["COMMIT", "PR_MERGED", "ISSUE_CLOSED"] },
      occurredAt: lowerBound ? { gte: lowerBound, lt: windowEnd } : { lt: windowEnd },
    },
    orderBy: { occurredAt: "asc" },
    take: 30,
  });

  const events = rawEvents.filter(
    (e) => e.type !== "COMMIT" || !isJunk(e.title)
  );

  // 3. Genuinely nothing to summarize — the only path that persists nothing.
  if (events.length === 0) {
    const emptyWindowStart = lowerBound ?? project.createdAt;
    console.log("[generateUpdate] no events to summarize", {
      manual,
      lowerBound: lowerBound?.toISOString() ?? null,
      windowEnd: windowEnd.toISOString(),
    });
    return {
      status: "no_events",
      hasPriorUpdate,
      windowStart: emptyWindowStart,
      windowEnd,
    };
  }

  // Effective window start now that we know the events we're summarizing:
  // manual → the 14-day window; cron subsequent → last window end; cron first →
  // the earliest event actually summarized (else createdAt).
  const windowStart: Date = manual
    ? fourteenDaysAgo
    : priorWindowEnd ?? events[0].occurredAt ?? project.createdAt;

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

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const parsed = await callClaudeWithRetry(anthropic, prompt);

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
