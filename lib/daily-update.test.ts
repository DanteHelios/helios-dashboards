import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock all deps before the module loads so we test the helper's orchestration
// (gating + resilience) in isolation, with no real DB / GitHub / Anthropic.
vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: {
      findMany: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
  },
}));
vi.mock("@/lib/github-sync", () => ({ syncProject: vi.fn() }));
vi.mock("@/lib/ai", () => ({ generateUpdate: vi.fn() }));
vi.mock("@/lib/monitoring", () => ({ captureException: vi.fn() }));

import { runDailyUpdate } from "./daily-update";
import { prisma } from "@/lib/prisma";
import { syncProject } from "@/lib/github-sync";
import { generateUpdate } from "@/lib/ai";

const mockFindMany = vi.mocked(prisma.project.findMany);
const mockSync = vi.mocked(syncProject);
const mockGen = vi.mocked(generateUpdate);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const project = (id: string, cronEnabled: boolean) =>
  ({ id, name: id.toUpperCase(), cronEnabled }) as any;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("runDailyUpdate gating + resilience", () => {
  it("generates (incrementally) when synced > 0 and cronEnabled", async () => {
    mockFindMany.mockResolvedValue([project("p1", true)]);
    mockSync.mockResolvedValue({ synced: 3, skipped: 0 });
    mockGen.mockResolvedValue({ status: "generated", source: "ai" } as never);

    const res = await runDailyUpdate();

    expect(mockGen).toHaveBeenCalledTimes(1);
    // No { manual: true } => incremental window, not the append-always path.
    expect(mockGen).toHaveBeenCalledWith("p1");
    expect(res[0].generated).toBe(true);
    expect(res[0].source).toBe("ai");
  });

  it("skips generation entirely when synced === 0 (no Anthropic call, no row)", async () => {
    mockFindMany.mockResolvedValue([project("p1", true)]);
    mockSync.mockResolvedValue({ synced: 0, skipped: 5 });

    const res = await runDailyUpdate();

    expect(mockGen).not.toHaveBeenCalled();
    expect(res[0].generated).toBe(false);
  });

  it("skips generation when cronEnabled is false even if synced > 0", async () => {
    mockFindMany.mockResolvedValue([project("p1", false)]);
    mockSync.mockResolvedValue({ synced: 2, skipped: 0 });

    const res = await runDailyUpdate();

    expect(mockGen).not.toHaveBeenCalled();
    expect(res[0].generated).toBe(false);
  });

  it("continues to the next project when one project's sync throws", async () => {
    mockFindMany.mockResolvedValue([project("bad", true), project("good", true)]);
    mockSync.mockImplementation(async (id: string) => {
      if (id === "bad") throw new Error("boom");
      return { synced: 1, skipped: 0 };
    });
    mockGen.mockResolvedValue({ status: "generated", source: "ai" } as never);

    const res = await runDailyUpdate();

    expect(res).toHaveLength(2);
    expect(res[0].syncError).toContain("boom");
    // The failing project did not get a generate call; the healthy one did.
    expect(mockGen).toHaveBeenCalledTimes(1);
    expect(mockGen).toHaveBeenCalledWith("good");
    expect(res[1].generated).toBe(true);
  });

  it("continues when a project's generate throws (records error, no abort)", async () => {
    mockFindMany.mockResolvedValue([project("p1", true), project("p2", true)]);
    mockSync.mockResolvedValue({ synced: 1, skipped: 0 });
    mockGen.mockImplementation(async (id: string) => {
      if (id === "p1") throw new Error("ai down");
      return { status: "generated", source: "ai" } as never;
    });

    const res = await runDailyUpdate();

    expect(res[0].generateError).toContain("ai down");
    expect(res[1].generated).toBe(true);
  });
});
