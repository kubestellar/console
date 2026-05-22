/**
 * Vitest handler tests for github-pipelines.mts (#15397, Part of #4189).
 *
 * Run from web/: npm run test:netlify-github-cluster
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertResponseHasNoSecrets,
  FAKE_GITHUB_TOKEN,
  freshBlobCacheEntry,
  readJson,
} from "./netlify-handler-helpers";

const SAMPLE_PULSE = {
  lastRun: {
    conclusion: "success",
    createdAt: "2026-05-22T00:00:00Z",
    htmlUrl: "https://github.com/kubestellar/console/actions/runs/1",
    runNumber: 42,
    releaseTag: "v0.3.21-nightly.20260522",
  },
  streak: 2,
  streakKind: "success",
  recent: [{ conclusion: "success", createdAt: "2026-05-21T00:00:00Z", htmlUrl: "https://example.com/r/2" }],
  nextCron: "0 5 * * *",
};

const SAMPLE_MATRIX = {
  days: 14,
  range: ["2026-05-08", "2026-05-22"],
  workflows: [{ repo: "kubestellar/console", name: "CI", cells: [] }],
};

const { mockGet, mockSet, mockEnforceSimpleRateLimit, mockBuildPulse, mockBuildMatrix, mockBuildFlow, mockBuildFailures, mockBuildLog } =
  vi.hoisted(() => ({
    mockGet: vi.fn(),
    mockSet: vi.fn(),
    mockEnforceSimpleRateLimit: vi.fn(),
    mockBuildPulse: vi.fn(),
    mockBuildMatrix: vi.fn(),
    mockBuildFlow: vi.fn(),
    mockBuildFailures: vi.fn(),
    mockBuildLog: vi.fn(),
  }));

vi.mock("@netlify/blobs", () => ({
  getStore: () => ({ get: mockGet, set: mockSet }),
}));

vi.mock("../_shared/rate-limit", () => ({
  enforceSimpleRateLimit: mockEnforceSimpleRateLimit,
}));

vi.mock("../github-pipelines/views", () => ({
  buildPulse: mockBuildPulse,
  buildMatrix: mockBuildMatrix,
  buildFlow: mockBuildFlow,
  buildFailures: mockBuildFailures,
  buildLog: mockBuildLog,
}));

import handler from "../github-pipelines.mts";

function makeRequest(search = "view=pulse"): Request {
  return new Request(`https://console.kubestellar.io/api/github-pipelines?${search}`, {
    method: "GET",
    headers: {
      Origin: "https://console.kubestellar.io",
      "x-nf-client-connection-ip": "203.0.113.10",
    },
  });
}

describe("github-pipelines", () => {
  const originalToken = process.env.GITHUB_TOKEN;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GITHUB_TOKEN = FAKE_GITHUB_TOKEN;
    mockEnforceSimpleRateLimit.mockResolvedValue({ limited: false });
    mockGet.mockResolvedValue(null);
    mockSet.mockResolvedValue(undefined);
    mockBuildPulse.mockResolvedValue(SAMPLE_PULSE);
    mockBuildMatrix.mockResolvedValue(SAMPLE_MATRIX);
    mockBuildFlow.mockResolvedValue({ runs: [] });
    mockBuildFailures.mockResolvedValue({ runs: [] });
    mockBuildLog.mockResolvedValue(
      new Response(JSON.stringify({ lines: ["log line"] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  });

  afterEach(() => {
    if (originalToken === undefined) {
      delete process.env.GITHUB_TOKEN;
    } else {
      process.env.GITHUB_TOKEN = originalToken;
    }
  });

  it("returns 204 for OPTIONS preflight", async () => {
    const res = await handler(
      new Request("https://console.kubestellar.io/api/github-pipelines", { method: "OPTIONS" }),
    );
    expect(res.status).toBe(204);
  });

  it("returns 500 when GITHUB_TOKEN is not configured", async () => {
    delete process.env.GITHUB_TOKEN;
    const res = await handler(makeRequest());
    expect(res.status).toBe(500);
    const body = await readJson<{ error: string }>(res);
    expect(body.error).toContain("GITHUB_TOKEN");
    assertResponseHasNoSecrets(JSON.stringify(body), [FAKE_GITHUB_TOKEN]);
  });

  it("returns 400 for unknown view", async () => {
    const res = await handler(makeRequest("view=not-a-real-view"));
    expect(res.status).toBe(400);
    const body = await readJson<{ error: string }>(res);
    expect(body.error).toBe("unknown view");
  });

  it("returns 429 when read rate limit is exceeded", async () => {
    mockEnforceSimpleRateLimit.mockResolvedValue({ limited: true, retryAfterSeconds: 60 });
    const res = await handler(makeRequest());
    expect(res.status).toBe(429);
    const body = await readJson<{ error: string; retryAfter: number }>(res);
    expect(body.error).toContain("Rate limit");
    expect(body.retryAfter).toBe(60);
    expect(mockBuildPulse).not.toHaveBeenCalled();
  });

  it("returns pulse payload with repos list on happy path", async () => {
    const res = await handler(makeRequest("view=pulse"));
    expect(res.status).toBe(200);
    const body = await readJson<typeof SAMPLE_PULSE & { repos: string[] }>(res);
    expect(body.streak).toBe(SAMPLE_PULSE.streak);
    expect(body.repos).toContain("kubestellar/console");
    expect(res.headers.get("X-Cache")).toBe("MISS");
    const raw = JSON.stringify(body);
    assertResponseHasNoSecrets(raw, [FAKE_GITHUB_TOKEN, "gho_", "github_pat_"]);
  });

  it("returns cached pulse without calling buildPulse", async () => {
    const cachedPayload = { ...SAMPLE_PULSE, repos: ["kubestellar/console"] };
    mockGet.mockResolvedValue(freshBlobCacheEntry(cachedPayload));
    const res = await handler(makeRequest("view=pulse"));
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Cache")).toBe("HIT");
    expect(mockBuildPulse).not.toHaveBeenCalled();
    const body = await readJson(res);
    expect(body).toMatchObject({ streak: SAMPLE_PULSE.streak, repos: ["kubestellar/console"] });
  });

  it("returns 500 with repos when buildPulse throws (upstream error)", async () => {
    mockBuildPulse.mockRejectedValue(new Error("pulse: GitHub 502"));
    const res = await handler(makeRequest("view=pulse"));
    expect(res.status).toBe(500);
    const body = await readJson<{ error: string; repos: string[] }>(res);
    expect(body.error).toBe("Internal error");
    expect(body.repos.length).toBeGreaterThan(0);
    assertResponseHasNoSecrets(JSON.stringify(body), [FAKE_GITHUB_TOKEN]);
  });

  it("returns matrix payload for view=matrix", async () => {
    const res = await handler(makeRequest("view=matrix&days=14"));
    expect(res.status).toBe(200);
    const body = await readJson<typeof SAMPLE_MATRIX & { repos: string[] }>(res);
    expect(body.days).toBe(14);
    expect(body.workflows.length).toBeGreaterThan(0);
    expect(body.repos).toContain("kubestellar/console");
    expect(mockBuildMatrix).toHaveBeenCalled();
  });

  it("returns 400 for log view with invalid job param", async () => {
    const res = await handler(makeRequest("view=log&repo=kubestellar/console&job=not-numeric"));
    expect(res.status).toBe(400);
    const body = await readJson<{ error: string }>(res);
    expect(body.error).toContain("job");
    expect(mockBuildLog).not.toHaveBeenCalled();
  });

  it("returns 405 for non-GET methods", async () => {
    const res = await handler(
      new Request("https://console.kubestellar.io/api/github-pipelines?view=pulse", { method: "POST" }),
    );
    expect(res.status).toBe(405);
    const body = await readJson<{ error: string }>(res);
    expect(body.error).toContain("GET");
  });
});
