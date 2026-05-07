import { describe, it, expect, vi } from "vitest";

// Mock heavy deps before the module is loaded
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@anthropic-ai/sdk", () => ({ default: vi.fn() }));

import { validateCitations } from "./ai";
import type { Bullet } from "./types";

describe("validateCitations", () => {
  it("keeps bullets with valid eventIds and drops bullets citing unknown ids", () => {
    const validId = "event-real-abc123";
    const fakeId = "event-fake-xyz999";

    const bullets: Bullet[] = [
      {
        text: "We shipped the new checkout flow.",
        sources: [{ eventId: validId }],
      },
      {
        text: "We launched a rocket to the moon.",
        sources: [{ eventId: fakeId }],
      },
    ];

    const result = validateCitations(bullets, new Set([validId]));

    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("We shipped the new checkout flow.");
  });

  it("drops a bullet that has no sources", () => {
    const bullets: Bullet[] = [
      { text: "Something happened.", sources: [] },
    ];

    const result = validateCitations(bullets, new Set(["any-id"]));

    expect(result).toHaveLength(0);
  });

  it("keeps a bullet only when ALL its sources are valid", () => {
    const id1 = "event-1";
    const id2 = "event-2";

    const bullets: Bullet[] = [
      { text: "Multi-source bullet.", sources: [{ eventId: id1 }, { eventId: id2 }] },
    ];

    // id2 is not in the valid set
    const result = validateCitations(bullets, new Set([id1]));

    expect(result).toHaveLength(0);
  });
});
