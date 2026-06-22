import { describe, it, expect, vi } from "vitest";

// Mock heavy deps before the module is loaded
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@anthropic-ai/sdk", () => ({ default: vi.fn() }));

import { sanitizeBullets, buildFallbackBullets } from "./ai";
import type { Bullet } from "./types";

describe("sanitizeBullets", () => {
  it("keeps a bullet but strips a source citing an unknown id", () => {
    const validId = "event-real-abc123";
    const fakeId = "event-fake-xyz999";

    const bullets: Bullet[] = [
      { text: "We shipped the new checkout flow.", sources: [{ eventId: validId }] },
      { text: "We launched a rocket to the moon.", sources: [{ eventId: fakeId }] },
    ];

    const result = sanitizeBullets(bullets, new Set([validId]));

    expect(result).toHaveLength(2);
    expect(result[0].sources).toEqual([{ eventId: validId }]);
    // Bullet kept, but its hallucinated source is stripped — rendered unlinked.
    expect(result[1].text).toBe("We launched a rocket to the moon.");
    expect(result[1].sources).toEqual([]);
  });

  it("keeps a bullet that has no sources, with an empty sources array", () => {
    const bullets: Bullet[] = [{ text: "Something happened.", sources: [] }];

    const result = sanitizeBullets(bullets, new Set(["any-id"]));

    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("Something happened.");
    expect(result[0].sources).toEqual([]);
  });

  it("keeps only the valid sources on a mixed-source bullet", () => {
    const id1 = "event-1";
    const id2 = "event-2";

    const bullets: Bullet[] = [
      { text: "Multi-source bullet.", sources: [{ eventId: id1 }, { eventId: id2 }] },
    ];

    // id2 is not in the valid set
    const result = sanitizeBullets(bullets, new Set([id1]));

    expect(result).toHaveLength(1);
    expect(result[0].sources).toEqual([{ eventId: id1 }]);
  });

  it("drops bullets with empty or whitespace-only text", () => {
    const bullets: Bullet[] = [
      { text: "   ", sources: [] },
      { text: "", sources: [{ eventId: "event-1" }] },
      { text: "Real bullet.", sources: [] },
    ];

    const result = sanitizeBullets(bullets, new Set(["event-1"]));

    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("Real bullet.");
  });

  it("keeps every bullet even when ALL sources are invalid (Guard B won't nuke)", () => {
    const bullets: Bullet[] = [
      { text: "First bullet.", sources: [{ eventId: "bad-1" }] },
      { text: "Second bullet.", sources: [{ eventId: "bad-2" }] },
    ];

    const result = sanitizeBullets(bullets, new Set(["real-id"]));

    expect(result).toHaveLength(2);
    expect(result.every((b) => b.sources.length === 0)).toBe(true);
  });
});

describe("buildFallbackBullets", () => {
  it("makes one labeled, self-cited bullet per event (capped at 6)", () => {
    const events = [
      { id: "e1", type: "COMMIT", title: "Add login form" },
      { id: "e2", type: "PR_MERGED", title: "Wire up auth" },
      { id: "e3", type: "ISSUE_CLOSED", title: "Fix redirect bug" },
    ];

    const result = buildFallbackBullets(events);

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({
      text: "Commit: Add login form",
      sources: [{ eventId: "e1" }],
    });
    expect(result[1].text).toBe("Merged PR: Wire up auth");
    expect(result[2].text).toBe("Closed issue: Fix redirect bug");
  });

  it("caps at 6 bullets", () => {
    const events = Array.from({ length: 10 }, (_, i) => ({
      id: `e${i}`,
      type: "COMMIT",
      title: `Commit ${i}`,
    }));

    expect(buildFallbackBullets(events)).toHaveLength(6);
  });
});
