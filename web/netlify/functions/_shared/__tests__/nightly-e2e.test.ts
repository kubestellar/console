import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchAll, hasInProgressRuns } from "../nightly-e2e";

const IMAGE_CACHE_KEY = "guide-images";
const RUN_IMAGE_CACHE_KEY = "run-images";
const WORKFLOW_RUNS_PATH = "/actions/workflows/";
const ARTIFACTS_PATH = "/actions/artifacts?name=image-metadata&per_page=100";
const IMAGE_CACHE_ENTRY = JSON.stringify({
  images: {
    "optimized-baseline": { router: "v1.2.3" },
  },
  expiresAt: Date.parse("2030-01-01T00:00:00.000Z"),
});
const WORKFLOW_RUN = {
  id: 101,
  status: "completed",
  conclusion: "success",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:10:00Z",
  html_url: "https://github.com/llm-d/llm-d/actions/runs/101",
  run_number: 5,
  event: "schedule",
};

describe("nightly-e2e shared helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("detects in-progress runs across guide collections", () => {
    expect(hasInProgressRuns([
      { guide: "one", runs: [{ status: "completed" }] },
      { guide: "two", runs: [{ status: "in_progress" }] },
    ] as never)).toBe(true);
    expect(hasInProgressRuns([
      { guide: "one", runs: [{ status: "completed" }] },
    ] as never)).toBe(false);
  });

  it("fetches workflows, reuses cached guide images, and stores per-run image cache entries", async () => {
    const store = {
      get: vi.fn(async (key: string) => {
        if (key === IMAGE_CACHE_KEY) return IMAGE_CACHE_ENTRY;
        if (key === RUN_IMAGE_CACHE_KEY) return JSON.stringify({ runs: {} });
        return null;
      }),
      set: vi.fn().mockResolvedValue(undefined),
    };
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes(WORKFLOW_RUNS_PATH)) {
        return new Response(JSON.stringify({ workflow_runs: [WORKFLOW_RUN] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes(ARTIFACTS_PATH)) {
        return new Response(JSON.stringify({ artifacts: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const guides = await fetchAll("github-token", store as never);

    expect(guides).toHaveLength(13);
    expect(guides[0]).toMatchObject({
      guide: "Optimized Baseline",
      passRate: 100,
      trend: "steady",
      latestConclusion: "success",
      llmdImages: { router: "v1.2.3" },
    });
    expect(fetchMock).toHaveBeenCalledTimes(14);
    expect(store.set).toHaveBeenCalledWith(RUN_IMAGE_CACHE_KEY, expect.stringContaining('"101":null'));
  });

  it("treats missing workflows as empty run histories", async () => {
    const store = {
      get: vi.fn(async (key: string) => {
        if (key === IMAGE_CACHE_KEY) return IMAGE_CACHE_ENTRY;
        if (key === RUN_IMAGE_CACHE_KEY) return JSON.stringify({ runs: {} });
        return null;
      }),
      set: vi.fn().mockResolvedValue(undefined),
    };
    let workflowCallCount = 0;
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes(WORKFLOW_RUNS_PATH)) {
        workflowCallCount += 1;
        if (workflowCallCount === 1) {
          return new Response("missing", { status: 404 });
        }
        return new Response(JSON.stringify({ workflow_runs: [WORKFLOW_RUN] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes(ARTIFACTS_PATH)) {
        return new Response(JSON.stringify({ artifacts: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const guides = await fetchAll("github-token", store as never);

    expect(guides[0]?.runs).toEqual([]);
    expect(guides[0]?.passRate).toBe(0);
    expect(guides[0]?.latestConclusion).toBeNull();
  });
});
