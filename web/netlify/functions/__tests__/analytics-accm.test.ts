/**
 * Vitest handler tests for analytics-accm.mts (#15403, Part of #4189).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertResponseHasNoSecrets,
  FAKE_GITHUB_TOKEN,
  makeNetlifyRequest,
  readJson,
} from "./netlify-handler-helpers";
import type { ACCMData } from "../analytics-accm/helpers";

const { mockGet, mockSet } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockSet: vi.fn(),
}));

const {
  mockFetchACCMFromGist,
  mockFetchRecentPRs,
  mockFetchRecentIssues,
  mockFetchWorkflowRuns,
  SAMPLE_ACCM,
} = vi.hoisted(() => ({
  mockFetchACCMFromGist: vi.fn(),
  mockFetchRecentPRs: vi.fn(),
  mockFetchRecentIssues: vi.fn(),
  mockFetchWorkflowRuns: vi.fn(),
  SAMPLE_ACCM: {
    weeklyActivity: [
      {
        week: "2026-W20",
        prsOpened: 3,
        prsMerged: 2,
        issuesOpened: 1,
        issuesClosed: 0,
        aiPrs: 1,
        humanPrs: 2,
        aiIssues: 0,
        humanIssues: 1,
        uniqueContributors: 4,
      },
    ],
    ciPassRates: [],
    contributorGrowth: { total: 10, weekly: [] },
    cachedAt: new Date().toISOString(),
  },
}));

vi.mock("@netlify/blobs", () => ({
  getStore: () => ({ get: mockGet, set: mockSet }),
}));

vi.mock("../analytics-accm/gist", () => ({
  fetchACCMFromGist: mockFetchACCMFromGist,
}));

vi.mock("../analytics-accm/fetchers", () => ({
  fetchRecentPRs: mockFetchRecentPRs,
  fetchRecentIssues: mockFetchRecentIssues,
  fetchWorkflowRuns: mockFetchWorkflowRuns,
}));

vi.mock("../analytics-accm/aggregation", () => ({
  aggregateWeeklyActivity: vi.fn(() => SAMPLE_ACCM.weeklyActivity),
  aggregateCIPassRates: vi.fn(() => SAMPLE_ACCM.ciPassRates),
  aggregateContributorGrowth: vi.fn(() => SAMPLE_ACCM.contributorGrowth),
}));

import handler from "../analytics-accm.mts";

const API_ANALYTICS_ACCM = "/api/analytics-accm";

describe("analytics-accm", () => {
  let envGet: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue(null);
    mockSet.mockResolvedValue(undefined);
    mockFetchACCMFromGist.mockResolvedValue(null);
    mockFetchRecentPRs.mockResolvedValue([]);
    mockFetchRecentIssues.mockResolvedValue([]);
    mockFetchWorkflowRuns.mockResolvedValue([]);

    envGet = vi.fn((key: string) => {
      if (key === "GITHUB_TOKEN") return FAKE_GITHUB_TOKEN;
      return undefined;
    });
    vi.stubGlobal("Netlify", { env: { get: envGet } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns 405 for non-GET methods", async () => {
    const res = await handler(
      makeNetlifyRequest(API_ANALYTICS_ACCM, { method: "POST" }),
    );
    expect(res.status).toBe(405);
    const body = await readJson<{ error: string }>(res);
    expect(body.error).toBe("Method not allowed");
  });

  it("returns precomputed gist data when gist fetch succeeds", async () => {
    mockFetchACCMFromGist.mockResolvedValue(SAMPLE_ACCM);
    const res = await handler(makeNetlifyRequest(API_ANALYTICS_ACCM));
    expect(res.status).toBe(200);

    const body = await readJson<ACCMData & { source: string }>(res);
    expect(body.source).toBe("gist");
    expect(body.weeklyActivity).toHaveLength(1);
    expect(body.weeklyActivity[0].week).toBe("2026-W20");
    expect(mockFetchRecentPRs).not.toHaveBeenCalled();
    assertResponseHasNoSecrets(JSON.stringify(body), [FAKE_GITHUB_TOKEN]);
  });

  it("serves valid blob cache without calling gist or GitHub", async () => {
    const cacheEntry = {
      data: SAMPLE_ACCM,
      expiresAt: Date.now() + 60_000,
    };
    mockGet.mockResolvedValue(JSON.stringify(cacheEntry));

    const res = await handler(makeNetlifyRequest(API_ANALYTICS_ACCM));
    expect(res.status).toBe(200);
    const body = await readJson<ACCMData & { fromCache: boolean }>(res);
    expect(body.fromCache).toBe(true);
    expect(body.weeklyActivity[0].prsOpened).toBe(3);
    expect(mockFetchACCMFromGist).not.toHaveBeenCalled();
  });

  it("falls back to live aggregation when gist is unavailable", async () => {
    mockFetchACCMFromGist.mockResolvedValue(null);
    const res = await handler(makeNetlifyRequest(API_ANALYTICS_ACCM));
    expect(res.status).toBe(200);

    const body = await readJson<ACCMData>(res);
    expect(body.weeklyActivity).toHaveLength(1);
    expect(mockFetchRecentPRs).toHaveBeenCalled();
    expect(mockFetchRecentIssues).toHaveBeenCalled();
    expect(mockFetchWorkflowRuns).toHaveBeenCalled();
  });

  it("returns 502 when live fetch pipeline fails", async () => {
    mockFetchACCMFromGist.mockResolvedValue(null);
    mockFetchRecentPRs.mockRejectedValue(new Error("GitHub API down"));

    const res = await handler(makeNetlifyRequest(API_ANALYTICS_ACCM));
    expect(res.status).toBe(502);
    const body = await readJson<{ error: string }>(res);
    expect(body.error).toBe("Failed to fetch ACCM metrics");
    assertResponseHasNoSecrets(JSON.stringify(body), [FAKE_GITHUB_TOKEN]);
  });
});
