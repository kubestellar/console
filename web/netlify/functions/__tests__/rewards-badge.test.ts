/**
 * Vitest unit tests for rewards-badge.mts Netlify function (#15951, Part of #4189).
 *
 * Mirrors pkg/api/handlers/rewards_badge.go: shields.io-style SVG tier badges
 * from GitHub Search API scoring + contributor ladder tiers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GITHUB_SCORING_GENERATED } from "../../../src/types/rewards.generated";
import {
  FAKE_GITHUB_TOKEN,
  makeNetlifyRequest,
} from "./netlify-handler-helpers";
import handler from "../rewards-badge.mts";

const HTTP_STATUS_OK = 200;
const HTTP_STATUS_BAD_GATEWAY = 502;

const CONTENT_TYPE_SVG = "image/svg+xml; charset=utf-8";
const BADGE_PATH_PREFIX = "/api/rewards/badge/";
const GITHUB_SEARCH_HOST = "https://api.github.com/search/issues";

const TIER_OBSERVER = "Observer";
const TIER_EXPLORER = "Explorer";
const TIER_PILOT = "Pilot";
const TIER_ERROR = "error";
const TIER_UNKNOWN = "unknown";

const COLOR_OBSERVER = "#6b7280";
const COLOR_EXPLORER = "#3b82f6";
const COLOR_PILOT = "#10b981";
const COLOR_ERROR = "#e05d44";
const COLOR_UNKNOWN = "#9e9e9e";

const EXPLORER_MIN_POINTS = 500;
const PILOT_MIN_POINTS = 5000;

const SAMPLE_LOGIN = "contributor-one";
const INVALID_LOGIN_SCRIPT = "<script>alert(1)</script>";
const INVALID_LOGIN_AMPERSAND = "user&amp;quotes";

/** Fixed clock so GitHub Search `created:>=YYYY-01-01` assertions stay deterministic. */
const FIXED_SEARCH_DATE = new Date("2026-06-15T12:00:00Z");
const FIXED_SEARCH_YEAR = 2026;

interface SearchItem {
  labels: Array<{ name: string }>;
  pull_request?: { merged_at?: string | null };
}

const mockFetch = vi.fn();

function makeBadgeRequest(login: string): Request {
  const path = login ? `${BADGE_PATH_PREFIX}${login}` : `${BADGE_PATH_PREFIX}`;
  return makeNetlifyRequest(path);
}

async function readSvg(res: Response): Promise<string> {
  return res.text();
}

function makeSearchResponse(items: SearchItem[], totalCount?: number): Response {
  const body = JSON.stringify({
    total_count: totalCount ?? items.length,
    items,
  });
  return new Response(body, {
    status: HTTP_STATUS_OK,
    headers: {
      "content-length": String(body.length),
      "content-type": "application/json",
    },
  });
}

function bugIssue(): SearchItem {
  return { labels: [{ name: "bug" }] };
}

function mergedPr(): SearchItem {
  return {
    labels: [],
    pull_request: { merged_at: "2026-01-15T00:00:00Z" },
  };
}

function openPr(): SearchItem {
  return { labels: [], pull_request: { merged_at: null } };
}

function resolveFetchUrl(input: string | URL | Request): string {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  return input.url;
}

/** Route GitHub Search calls by issue vs PR query type. */
function mockGitHubSearch(issues: SearchItem[], prs: SearchItem[]): void {
  mockFetch.mockImplementation((input: string | URL | Request) => {
    const url = resolveFetchUrl(input);

    if (!url.startsWith(GITHUB_SEARCH_HOST)) {
      return Promise.reject(new Error(`unexpected fetch URL: ${url}`));
    }

    const decoded = decodeURIComponent(url);
    if (decoded.includes("type:issue")) {
      return Promise.resolve(makeSearchResponse(issues));
    }
    if (decoded.includes("type:pr")) {
      return Promise.resolve(makeSearchResponse(prs));
    }
    return Promise.reject(new Error(`unrecognized search query: ${url}`));
  });
}

function expectedSearchQuery(login: string, itemType: "issue" | "pr"): string {
  const yearStart = `${FIXED_SEARCH_YEAR}-01-01`;
  return `author:${login} repo:kubestellar/console repo:kubestellar/console-marketplace repo:kubestellar/console-kb repo:kubestellar/docs type:${itemType} created:>=${yearStart}`;
}

function getFetchCalls(): Array<{ url: string; init?: RequestInit }> {
  return mockFetch.mock.calls.map((call) => ({
    url: resolveFetchUrl(call[0] as string | URL | Request),
    init: call[1] as RequestInit | undefined,
  }));
}

function getSearchQueriesFromFetchCalls(): string[] {
  return getFetchCalls()
    .map((call) => new URL(call.url).searchParams.get("q"))
    .filter((query): query is string => query !== null);
}

describe("rewards-badge", () => {
  const originalGithubToken = process.env.GITHUB_TOKEN;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_SEARCH_DATE);
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
    delete process.env.GITHUB_TOKEN;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    if (originalGithubToken !== undefined) {
      process.env.GITHUB_TOKEN = originalGithubToken;
    } else {
      delete process.env.GITHUB_TOKEN;
    }
  });

  describe("input validation", () => {
    it("returns error badge when username param is missing", async () => {
      const res = await handler(makeBadgeRequest(""));
      expect(res.status).toBe(HTTP_STATUS_BAD_GATEWAY);
      expect(res.headers.get("Content-Type")).toBe(CONTENT_TYPE_SVG);

      const svg = await readSvg(res);
      expect(svg).toContain(TIER_ERROR);
      expect(svg).toContain(COLOR_ERROR);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("returns error badge when username contains invalid characters", async () => {
      const res = await handler(makeBadgeRequest("not valid!!!"));
      expect(res.status).toBe(HTTP_STATUS_BAD_GATEWAY);

      const svg = await readSvg(res);
      expect(svg).toContain(TIER_ERROR);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe("GitHub search integration", () => {
    it("calls GitHub Search API with correct query for the given username", async () => {
      mockGitHubSearch([], []);

      await handler(makeBadgeRequest(SAMPLE_LOGIN));

      expect(mockFetch).toHaveBeenCalledTimes(2);
      const queries = getSearchQueriesFromFetchCalls();

      expect(queries).toContain(expectedSearchQuery(SAMPLE_LOGIN, "issue"));
      expect(queries).toContain(expectedSearchQuery(SAMPLE_LOGIN, "pr"));
    });

    it("includes Authorization header when GITHUB_TOKEN env var is set", async () => {
      process.env.GITHUB_TOKEN = FAKE_GITHUB_TOKEN;
      mockGitHubSearch([], []);

      await handler(makeBadgeRequest(SAMPLE_LOGIN));

      const calls = getFetchCalls();
      for (const call of calls) {
        const headers = call.init?.headers as Record<string, string> | undefined;
        expect(headers?.Authorization).toBe(`Bearer ${FAKE_GITHUB_TOKEN}`);
      }
    });
  });

  describe("score calculation", () => {
    it("calculates Observer tier (entry level) when GitHub search returns 0 results", async () => {
      mockGitHubSearch([], []);

      const res = await handler(makeBadgeRequest(SAMPLE_LOGIN));
      expect(res.status).toBe(HTTP_STATUS_OK);

      const svg = await readSvg(res);
      expect(svg).toContain(TIER_OBSERVER);
      expect(svg).toContain(COLOR_OBSERVER);
    });

    it("calculates Explorer tier for score in mid contributor range", async () => {
      const bugCount = Math.ceil(EXPLORER_MIN_POINTS / GITHUB_SCORING_GENERATED.BugIssue);
      const issues = Array.from({ length: bugCount }, () => bugIssue());
      mockGitHubSearch(issues, []);

      const res = await handler(makeBadgeRequest(SAMPLE_LOGIN));
      const svg = await readSvg(res);
      expect(svg).toContain(TIER_EXPLORER);
      expect(svg).toContain(COLOR_EXPLORER);
    });

    it("calculates Pilot tier for score in upper contributor range", async () => {
      const bugCount = Math.ceil(PILOT_MIN_POINTS / GITHUB_SCORING_GENERATED.BugIssue);
      const issues = Array.from({ length: bugCount }, () => bugIssue());
      mockGitHubSearch(issues, []);

      const res = await handler(makeBadgeRequest(SAMPLE_LOGIN));
      const svg = await readSvg(res);
      expect(svg).toContain(TIER_PILOT);
      expect(svg).toContain(COLOR_PILOT);
    });

    it("calculates merged PR bonus on top of issue points", async () => {
      mockGitHubSearch([], [mergedPr(), openPr()]);

      const res = await handler(makeBadgeRequest(SAMPLE_LOGIN));
      const svg = await readSvg(res);
      const expectedPoints =
        GITHUB_SCORING_GENERATED.PROpened * 2 + GITHUB_SCORING_GENERATED.PRMerged;
      expect(expectedPoints).toBeGreaterThanOrEqual(EXPLORER_MIN_POINTS);
      expect(svg).toContain(TIER_EXPLORER);
    });
  });

  describe("SVG output", () => {
    it("returns response with Content-Type: image/svg+xml", async () => {
      mockGitHubSearch([], []);

      const res = await handler(makeBadgeRequest(SAMPLE_LOGIN));
      expect(res.headers.get("Content-Type")).toBe(CONTENT_TYPE_SVG);
      expect((await readSvg(res)).startsWith("<svg")).toBe(true);
    });

    it("SVG output contains kubestellar label and tier name for the computed level", async () => {
      mockGitHubSearch([], []);

      const res = await handler(makeBadgeRequest(SAMPLE_LOGIN));
      const svg = await readSvg(res);

      expect(svg).toContain("kubestellar");
      expect(svg).toContain(TIER_OBSERVER);
      expect(svg).toContain(`aria-label="kubestellar: ${TIER_OBSERVER}"`);
    });

    it("SVG output contains Explorer tier label for mid-range score", async () => {
      const bugCount = Math.ceil(EXPLORER_MIN_POINTS / GITHUB_SCORING_GENERATED.BugIssue);
      mockGitHubSearch(Array.from({ length: bugCount }, () => bugIssue()), []);

      const svg = await readSvg(await handler(makeBadgeRequest(SAMPLE_LOGIN)));
      expect(svg).toContain(TIER_EXPLORER);
    });

    it("escapes special HTML characters in username to prevent XSS", async () => {
      const res = await handler(makeBadgeRequest(INVALID_LOGIN_SCRIPT));
      const svg = await readSvg(res);

      expect(res.status).toBe(HTTP_STATUS_BAD_GATEWAY);
      expect(svg).not.toContain("<script>");
      expect(svg).not.toMatch(/<script[\s>]/i);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("escapes ampersands and quotes in username by rejecting invalid logins", async () => {
      const res = await handler(makeBadgeRequest(INVALID_LOGIN_AMPERSAND));
      const svg = await readSvg(res);

      expect(res.status).toBe(HTTP_STATUS_BAD_GATEWAY);
      expect(svg).not.toContain("&amp;");
      expect(svg).not.toContain(INVALID_LOGIN_AMPERSAND);
      expect(svg).toContain(TIER_ERROR);
    });
  });

  describe("error handling", () => {
    it("returns error badge when GitHub API returns non-OK status", async () => {
      mockFetch.mockResolvedValue(
        new Response("upstream failure", { status: 500 }),
      );

      const res = await handler(makeBadgeRequest(SAMPLE_LOGIN));
      expect(res.status).toBe(HTTP_STATUS_BAD_GATEWAY);

      const svg = await readSvg(res);
      expect(svg).toContain(TIER_ERROR);
      expect(svg).toContain(COLOR_ERROR);
    });

    it("returns error badge when GitHub API throws network error", async () => {
      mockFetch.mockRejectedValue(new Error("network unreachable"));

      const res = await handler(makeBadgeRequest(SAMPLE_LOGIN));
      expect(res.status).toBe(HTTP_STATUS_BAD_GATEWAY);

      const svg = await readSvg(res);
      expect(svg).toContain(TIER_ERROR);
      expect(svg.startsWith("<svg")).toBe(true);
    });

    it("returns a valid fallback SVG even on GitHub API error", async () => {
      mockFetch.mockRejectedValue(new Error("connection reset"));

      const res = await handler(makeBadgeRequest(SAMPLE_LOGIN));
      const svg = await readSvg(res);

      expect(res.headers.get("Content-Type")).toBe(CONTENT_TYPE_SVG);
      expect(svg).toMatch(/<svg[\s\S]*<\/svg>/);
      expect(svg).toContain(TIER_ERROR);
    });

    it("returns unknown tier SVG when GitHub reports unknown login (404)", async () => {
      mockFetch.mockResolvedValue(new Response("", { status: 404 }));

      const res = await handler(makeBadgeRequest("ghost-user"));
      expect(res.status).toBe(HTTP_STATUS_OK);

      const svg = await readSvg(res);
      expect(svg).toContain(TIER_UNKNOWN);
      expect(svg).toContain(COLOR_UNKNOWN);
    });
  });
});
