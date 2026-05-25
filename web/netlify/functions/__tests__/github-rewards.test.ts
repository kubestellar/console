/**
 * Vitest unit tests for github-rewards.mts Netlify function (#15646, Part of #4189).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  makeNetlifyRequest,
  readJson,
  assertResponseHasNoSecrets,
} from "./netlify-handler-helpers";

// Named mocks for Netlify Blobs using vi.hoisted for proper hoisting
const { mockGet, mockSetJSON } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockSetJSON: vi.fn(),
}));

vi.mock("@netlify/blobs", () => ({
  getStore: () => ({
    get: mockGet,
    setJSON: mockSetJSON,
  }),
}));

import handler from "../github-rewards.mts";
import {
  MAX_RESPONSE_BYTES,
  LEADERBOARD_URL,
  LEADERBOARD_CACHE_KEY,
  LEADERBOARD_CACHE_TTL_MS,
  type LeaderboardData,
  type GitHubRewardsResponse,
} from "../_shared/github-rewards.constants";

// Named constants for HTTP status codes to prevent magic numbers
const HTTP_STATUS_OK = 200;
const HTTP_STATUS_NO_CONTENT = 204;
const HTTP_STATUS_BAD_REQUEST = 400;
const HTTP_STATUS_METHOD_NOT_ALLOWED = 405;
const HTTP_STATUS_SERVICE_UNAVAILABLE = 503;

const mockFetch = vi.fn();

const SAMPLE_LEADERBOARD: LeaderboardData = {
  generated_at: "2026-05-25T10:00:00Z",
  git_hash: "ae0808309",
  entries: [
    {
      login: "rishi-jat",
      avatar_url: "https://github.com/rishi-jat.png",
      total_points: 120,
      level: "Maintainer",
      level_rank: 1,
      breakdown: {
        bug_issues: 2,
        feature_issues: 3,
        other_issues: 1,
        prs_opened: 5,
        prs_merged: 4,
      },
      bonus_points: 15,
      rank: 2,
    },
    {
      login: "clubanderson",
      avatar_url: "https://github.com/clubanderson.png",
      total_points: 300,
      level: "Elite",
      level_rank: 2,
      breakdown: {
        bug_issues: 10,
        feature_issues: 5,
        other_issues: 2,
        prs_opened: 15,
        prs_merged: 14,
      },
      bonus_points: 50,
      rank: 1,
    },
  ],
};

describe("github-rewards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockReset();
    mockGet.mockResolvedValue(null);
    mockSetJSON.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("CORS & HTTP Method Validations", () => {
    it("returns 204 with CORS headers for OPTIONS preflight", async () => {
      const req = makeNetlifyRequest("/.netlify/functions/github-rewards", {
        method: "OPTIONS",
      });
      const res = await handler(req);
      expect(res.status).toBe(HTTP_STATUS_NO_CONTENT);
      expect(res.headers.get("access-control-allow-origin")).toBe("*");

      const allowedMethods = (res.headers.get("access-control-allow-methods") ?? "")
        .split(",")
        .map((method) => method.trim());
      expect(allowedMethods).toContain("GET");
      expect(allowedMethods).toContain("OPTIONS");
    });

    it("returns 405 Method Not Allowed for unsupported methods", async () => {
      const req = makeNetlifyRequest("/.netlify/functions/github-rewards", {
        method: "POST",
      });
      const res = await handler(req);
      expect(res.status).toBe(HTTP_STATUS_METHOD_NOT_ALLOWED);
      const body = await readJson<{ error: string }>(res);
      expect(body.error).toBe("Method not allowed");
    });
  });

  describe("Query Parameter Validation", () => {
    it("returns 400 when login query parameter is missing", async () => {
      const req = makeNetlifyRequest("/.netlify/functions/github-rewards");
      const res = await handler(req);
      expect(res.status).toBe(HTTP_STATUS_BAD_REQUEST);
      const body = await readJson<{ error: string }>(res);
      expect(body.error).toBe("Missing or invalid login parameter");
    });

    it("returns 400 when login query parameter is empty", async () => {
      const req = makeNetlifyRequest("/.netlify/functions/github-rewards?login=");
      const res = await handler(req);
      expect(res.status).toBe(HTTP_STATUS_BAD_REQUEST);
      const body = await readJson<{ error: string }>(res);
      expect(body.error).toBe("Missing or invalid login parameter");
    });

    it("returns 400 when login query parameter contains invalid characters", async () => {
      const req = makeNetlifyRequest("/.netlify/functions/github-rewards?login=rishi@jat");
      const res = await handler(req);
      expect(res.status).toBe(HTTP_STATUS_BAD_REQUEST);
      const body = await readJson<{ error: string }>(res);
      expect(body.error).toBe("Missing or invalid login parameter");
    });
  });

  describe("Success Path & Newcomer Fallbacks", () => {
    it("returns matching contributor details correctly", async () => {
      mockFetch.mockImplementation(
        () =>
          new Response(JSON.stringify(SAMPLE_LEADERBOARD), {
            status: 200,
            headers: { "content-length": "1000" },
          })
      );

      const req = makeNetlifyRequest("/.netlify/functions/github-rewards?login=rishi-jat");
      const res = await handler(req);
      expect(res.status).toBe(HTTP_STATUS_OK);
      const body = await readJson<GitHubRewardsResponse>(res);

      expect(body.total_points).toBe(120);
      expect(body.level).toBe("Maintainer");
      expect(body.rank).toBe(2);
      expect(body.bonus_points).toBe(15);
      expect(body.breakdown).toEqual({
        bug_issues: 2,
        feature_issues: 3,
        other_issues: 1,
        prs_opened: 5,
        prs_merged: 4,
      });
      expect(body.leaderboard_generated_at).toBe("2026-05-25T10:00:00Z");
      expect(body.contributions).toEqual([]);
    });

    it("performs case-insensitive comparison for login lookup", async () => {
      mockFetch.mockImplementation(
        () =>
          new Response(JSON.stringify(SAMPLE_LEADERBOARD), {
            status: 200,
            headers: { "content-length": "1000" },
          })
      );

      const req = makeNetlifyRequest("/.netlify/functions/github-rewards?login=RISHI-JAT");
      const res = await handler(req);
      expect(res.status).toBe(HTTP_STATUS_OK);
      const body = await readJson<GitHubRewardsResponse>(res);
      expect(body.total_points).toBe(120);
    });

    it("returns default newcomer statistics when username is not in leaderboard entries list", async () => {
      mockFetch.mockImplementation(
        () =>
          new Response(JSON.stringify(SAMPLE_LEADERBOARD), {
            status: 200,
            headers: { "content-length": "1000" },
          })
      );

      const req = makeNetlifyRequest("/.netlify/functions/github-rewards?login=some-newbie");
      const res = await handler(req);
      expect(res.status).toBe(HTTP_STATUS_OK);
      const body = await readJson<GitHubRewardsResponse>(res);

      expect(body.total_points).toBe(0);
      expect(body.level).toBe("Newcomer");
      expect(body.rank).toBe(0);
      expect(body.bonus_points).toBe(0);
      expect(body.breakdown).toEqual({
        bug_issues: 0,
        feature_issues: 0,
        other_issues: 0,
        prs_opened: 0,
        prs_merged: 0,
      });
      expect(body.leaderboard_generated_at).toBe("2026-05-25T10:00:00Z");
    });

    it("returns default newcomer statistics when entries list is empty", async () => {
      const emptyLeaderboard = {
        generated_at: "2026-05-25T12:00:00Z",
        git_hash: "12345",
        entries: [],
      };
      mockFetch.mockImplementation(
        () =>
          new Response(JSON.stringify(emptyLeaderboard), {
            status: 200,
            headers: { "content-length": "1000" },
          })
      );

      const req = makeNetlifyRequest("/.netlify/functions/github-rewards?login=rishi-jat");
      const res = await handler(req);
      expect(res.status).toBe(HTTP_STATUS_OK);
      const body = await readJson<GitHubRewardsResponse>(res);

      expect(body.total_points).toBe(0);
      expect(body.level).toBe("Newcomer");
      expect(body.rank).toBe(0);
      expect(body.leaderboard_generated_at).toBe("2026-05-25T12:00:00Z");
    });
  });

  describe("Caching & Blobs Operations", () => {
    it("successfully populates Netlify Blobs cache upon first upstream fetch", async () => {
      mockFetch.mockImplementation(
        () =>
          new Response(JSON.stringify(SAMPLE_LEADERBOARD), {
            status: 200,
            headers: { "content-length": "1000" },
          })
      );

      const req = makeNetlifyRequest("/.netlify/functions/github-rewards?login=rishi-jat");
      await handler(req);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch.mock.calls[0][0]).toBe(LEADERBOARD_URL);
      expect(mockSetJSON).toHaveBeenCalledWith(LEADERBOARD_CACHE_KEY, expect.any(Object));

      const cacheObj = mockSetJSON.mock.calls[0][1];
      expect(cacheObj.data).toEqual(SAMPLE_LEADERBOARD);
      expect(cacheObj.storedAt).toBeLessThanOrEqual(Date.now());
    });

    it("serves from cache on subsequent calls within the TTL window", async () => {
      mockGet.mockResolvedValue({
        data: SAMPLE_LEADERBOARD,
        storedAt: Date.now(),
      });

      const req = makeNetlifyRequest("/.netlify/functions/github-rewards?login=rishi-jat");
      const res = await handler(req);
      expect(res.status).toBe(HTTP_STATUS_OK);
      expect(mockFetch).not.toHaveBeenCalled();

      const body = await readJson<GitHubRewardsResponse>(res);
      expect(body.total_points).toBe(120);
    });

    it("proceeds to fetch from upstream when the cache entry is expired", async () => {
      const oneHourAgo = Date.now() - (LEADERBOARD_CACHE_TTL_MS + 1000);
      mockGet.mockResolvedValue({
        data: SAMPLE_LEADERBOARD,
        storedAt: oneHourAgo,
      });

      mockFetch.mockImplementation(
        () =>
          new Response(JSON.stringify(SAMPLE_LEADERBOARD), {
            status: 200,
            headers: { "content-length": "1000" },
          })
      );

      const req = makeNetlifyRequest("/.netlify/functions/github-rewards?login=rishi-jat");
      const res = await handler(req);
      expect(res.status).toBe(HTTP_STATUS_OK);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("recovers gracefully and fetches from upstream if cache reading throws an error", async () => {
      mockGet.mockRejectedValue(new Error("Netlify Blobs connection failure"));
      mockFetch.mockImplementation(
        () =>
          new Response(JSON.stringify(SAMPLE_LEADERBOARD), {
            status: 200,
            headers: { "content-length": "1000" },
          })
      );

      const req = makeNetlifyRequest("/.netlify/functions/github-rewards?login=rishi-jat");
      const res = await handler(req);
      expect(res.status).toBe(HTTP_STATUS_OK);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("returns successful response even if Netlify Blobs cache writing throws an error", async () => {
      mockFetch.mockImplementation(
        () =>
          new Response(JSON.stringify(SAMPLE_LEADERBOARD), {
            status: 200,
            headers: { "content-length": "1000" },
          })
      );
      mockSetJSON.mockRejectedValue(new Error("Netlify Blobs write timeout"));

      const req = makeNetlifyRequest("/.netlify/functions/github-rewards?login=rishi-jat");
      const res = await handler(req);
      expect(res.status).toBe(HTTP_STATUS_OK);
      const body = await readJson<GitHubRewardsResponse>(res);
      expect(body.total_points).toBe(120);
    });
  });

  describe("Error Handling & Leak Prevention", () => {
    it("returns 503 Service Unavailable when upstream returns 4xx status", async () => {
      mockFetch.mockImplementation(
        () =>
          new Response("", {
            status: 404,
            statusText: "Not Found",
          })
      );

      const req = makeNetlifyRequest("/.netlify/functions/github-rewards?login=rishi-jat");
      const res = await handler(req);
      expect(res.status).toBe(HTTP_STATUS_SERVICE_UNAVAILABLE);
      const body = await readJson<{ error: string }>(res);
      expect(body.error).toBe("Leaderboard unavailable");
    });

    it("returns 503 Service Unavailable when upstream returns 5xx status", async () => {
      mockFetch.mockImplementation(
        () =>
          new Response("", {
            status: 502,
            statusText: "Bad Gateway",
          })
      );

      const req = makeNetlifyRequest("/.netlify/functions/github-rewards?login=rishi-jat");
      const res = await handler(req);
      expect(res.status).toBe(HTTP_STATUS_SERVICE_UNAVAILABLE);
    });

    it("returns 503 Service Unavailable safely without leaking details if upstream returns malformed JSON", async () => {
      const rawMalformedText = "This is not JSON!";
      mockFetch.mockImplementation(
        () =>
          new Response(rawMalformedText, {
            status: 200,
            headers: { "content-length": String(rawMalformedText.length) },
          })
      );

      const req = makeNetlifyRequest("/.netlify/functions/github-rewards?login=rishi-jat");
      const res = await handler(req);
      expect(res.status).toBe(HTTP_STATUS_SERVICE_UNAVAILABLE);
      const body = await readJson<{ error: string }>(res);
      expect(body.error).toBe("Leaderboard unavailable");
      assertResponseHasNoSecrets(JSON.stringify(body), [rawMalformedText, "SyntaxError"]);
    });

    it("returns 503 Service Unavailable safely if fetch timeout or network failure occurs", async () => {
      const timeoutErrorMessage = "Connection reset by peer";
      mockFetch.mockRejectedValue(new Error(timeoutErrorMessage));

      const req = makeNetlifyRequest("/.netlify/functions/github-rewards?login=rishi-jat");
      const res = await handler(req);
      expect(res.status).toBe(HTTP_STATUS_SERVICE_UNAVAILABLE);
      const body = await readJson<{ error: string }>(res);
      expect(body.error).toBe("Leaderboard unavailable");
      assertResponseHasNoSecrets(JSON.stringify(body), [timeoutErrorMessage]);
    });

    it("returns 503 Service Unavailable safely if upstream response body exceeds limits", async () => {
      const oversizedLength = MAX_RESPONSE_BYTES + 1;
      mockFetch.mockImplementation(
        () =>
          new Response("a".repeat(oversizedLength), {
            status: 200,
            headers: { "content-length": String(oversizedLength) },
          })
      );

      const req = makeNetlifyRequest("/.netlify/functions/github-rewards?login=rishi-jat");
      const res = await handler(req);
      expect(res.status).toBe(HTTP_STATUS_SERVICE_UNAVAILABLE);
      const body = await readJson<{ error: string }>(res);
      expect(body.error).toBe("Leaderboard unavailable");
      assertResponseHasNoSecrets(JSON.stringify(body), ["too large"]);
    });
  });
});
