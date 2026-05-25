/**
 * Vitest unit tests for bonus-points.mts Netlify function (#15639, Part of #4189).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  TEST_CORS_ORIGIN,
  FAKE_GITHUB_TOKEN,
  makeNetlifyRequest,
  readJson,
  assertResponseHasNoSecrets,
} from "./netlify-handler-helpers";
import handler, { _testOnly } from "../bonus-points.mts";

const { MAX_RESPONSE_BYTES, resetCache } = _testOnly;

// Named constants for HTTP status codes to avoid magic numbers
const HTTP_STATUS_OK = 200;
const HTTP_STATUS_BAD_REQUEST = 400;
const HTTP_STATUS_BAD_GATEWAY = 502;

// Type definitions matching the API contract for absolute type safety
interface BonusEntry {
  issue_number: number;
  points: number;
  reason: string;
  created_at: string;
  state: string;
}

interface BonusResponse {
  login: string;
  total_bonus_points: number;
  entries: BonusEntry[];
}

// Global fetch mock helper
const mockFetch = vi.fn();

describe("bonus-points", () => {
  const originalToken = process.env.GITHUB_TOKEN;

  beforeEach(() => {
    vi.clearAllMocks();
    resetCache();
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockReset();
    process.env.GITHUB_TOKEN = FAKE_GITHUB_TOKEN;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    if (originalToken === undefined) {
      delete process.env.GITHUB_TOKEN;
    } else {
      process.env.GITHUB_TOKEN = originalToken;
    }
  });

  describe("CORS & Preflight Validation", () => {
    it("returns preflight CORS response for OPTIONS", async () => {
      const req = makeNetlifyRequest("/.netlify/functions/bonus-points", {
        method: "OPTIONS",
      });
      const res = await handler(req);
      expect(res.status).toBe(204);
      expect(res.headers.get("access-control-allow-origin")).toBe(TEST_CORS_ORIGIN);
      expect(res.headers.get("access-control-allow-methods")).toContain("GET, OPTIONS");
    });
  });

  describe("Query Parameter Validation", () => {
    it("returns 400 when login query parameter is missing", async () => {
      const req = makeNetlifyRequest("/.netlify/functions/bonus-points");
      const res = await handler(req);
      expect(res.status).toBe(HTTP_STATUS_BAD_REQUEST);
      const body = await readJson<{ error: string }>(res);
      expect(body.error).toBe("Missing ?login= parameter");
    });

    it("returns 400 when login username starts with a hyphen", async () => {
      const req = makeNetlifyRequest("/.netlify/functions/bonus-points?login=-invalid-user");
      const res = await handler(req);
      expect(res.status).toBe(HTTP_STATUS_BAD_REQUEST);
      const body = await readJson<{ error: string }>(res);
      expect(body.error).toBe("Invalid GitHub username format");
    });

    it("returns 400 when login username is too long", async () => {
      const longUsername = "a".repeat(40);
      const req = makeNetlifyRequest(`/.netlify/functions/bonus-points?login=${longUsername}`);
      const res = await handler(req);
      expect(res.status).toBe(HTTP_STATUS_BAD_REQUEST);
      const body = await readJson<{ error: string }>(res);
      expect(body.error).toBe("Invalid GitHub username format");
    });
  });

  describe("Regex Matching & Points Aggregation", () => {
    it("returns 0 points when no issues exist on GitHub", async () => {
      mockFetch.mockResolvedValue(new Response("[]", {
        status: 200,
        headers: { "content-length": "2" },
      }));

      const req = makeNetlifyRequest("/.netlify/functions/bonus-points?login=rishi-jat");
      const res = await handler(req);
      expect(res.status).toBe(HTTP_STATUS_OK);
      const body = await readJson<BonusResponse>(res);
      expect(body.login).toBe("rishi-jat");
      expect(body.total_bonus_points).toBe(0);
      expect(body.entries).toEqual([]);
    });

    it("correctly aggregates points for one matching [bonus] issue", async () => {
      const mockIssues = [
        {
          number: 42,
          title: "[bonus] @rishi-jat +50 Completed console unit testing framework",
          user: { login: "clubanderson" },
          created_at: "2026-05-25T12:00:00Z",
          state: "closed",
        },
      ];
      mockFetch.mockResolvedValue(new Response(JSON.stringify(mockIssues), {
        status: 200,
        headers: { "content-length": "100" },
      }));

      const req = makeNetlifyRequest("/.netlify/functions/bonus-points?login=rishi-jat");
      const res = await handler(req);
      expect(res.status).toBe(HTTP_STATUS_OK);
      const body = await readJson<BonusResponse>(res);

      expect(body.login).toBe("rishi-jat");
      expect(body.total_bonus_points).toBe(50);
      expect(body.entries).toHaveLength(1);
      expect(body.entries[0]).toEqual({
        issue_number: 42,
        points: 50,
        reason: "Completed console unit testing framework",
        created_at: "2026-05-25T12:00:00Z",
        state: "closed",
      });
    });

    it("correctly aggregates points across multiple issues and filters other logins", async () => {
      const mockIssues = [
        {
          number: 101,
          title: "[bonus] @rishi-jat +10 Fix alignment",
          user: { login: "clubanderson" },
          created_at: "2026-05-25T10:00:00Z",
          state: "closed",
        },
        {
          number: 102,
          title: "[bonus] @other-user +30 Outstanding contribution",
          user: { login: "clubanderson" },
          created_at: "2026-05-25T11:00:00Z",
          state: "open",
        },
        {
          number: 103,
          title: "[bonus] @rishi-jat +25 Added cache layer",
          user: { login: "clubanderson" },
          created_at: "2026-05-25T12:00:00Z",
          state: "closed",
        },
      ];
      mockFetch.mockResolvedValue(new Response(JSON.stringify(mockIssues), {
        status: 200,
        headers: { "content-length": "500" },
      }));

      const req = makeNetlifyRequest("/.netlify/functions/bonus-points?login=rishi-jat");
      const res = await handler(req);
      expect(res.status).toBe(HTTP_STATUS_OK);
      const body = await readJson<BonusResponse>(res);

      expect(body.login).toBe("rishi-jat");
      expect(body.total_bonus_points).toBe(35); // 10 + 25
      expect(body.entries).toHaveLength(2);
      expect(body.entries[0].issue_number).toBe(101);
      expect(body.entries[1].issue_number).toBe(103);
    });

    it("ignores issues created by unapproved creators or mismatching patterns", async () => {
      const mockIssues = [
        {
          number: 201,
          title: "[bonus] @rishi-jat +10 Points from bad user",
          user: { login: "some-spammer" }, // Unapproved creator
          created_at: "2026-05-25T10:00:00Z",
          state: "closed",
        },
        {
          number: 202,
          title: "Just a standard title with @rishi-jat +20 bonus points", // mismatch pattern
          user: { login: "clubanderson" },
          created_at: "2026-05-25T11:00:00Z",
          state: "closed",
        },
        {
          number: 203,
          title: "[bonus] @rishi-jat +0 Zero points", // non-positive points ignored
          user: { login: "clubanderson" },
          created_at: "2026-05-25T12:00:00Z",
          state: "closed",
        },
      ];
      mockFetch.mockResolvedValue(new Response(JSON.stringify(mockIssues), {
        status: 200,
        headers: { "content-length": "500" },
      }));

      const req = makeNetlifyRequest("/.netlify/functions/bonus-points?login=rishi-jat");
      const res = await handler(req);
      expect(res.status).toBe(HTTP_STATUS_OK);
      const body = await readJson<BonusResponse>(res);
      expect(body.total_bonus_points).toBe(0);
      expect(body.entries).toEqual([]);
    });

    it("parses titles without explicit reasons safely by defaulting to (no reason)", async () => {
      const mockIssues = [
        {
          number: 301,
          title: "[bonus] @rishi-jat +15", // missing trailing reason text
          user: { login: "clubanderson" },
          created_at: "2026-05-25T10:00:00Z",
          state: "closed",
        },
      ];
      mockFetch.mockResolvedValue(new Response(JSON.stringify(mockIssues), {
        status: 200,
        headers: { "content-length": "100" },
      }));

      const req = makeNetlifyRequest("/.netlify/functions/bonus-points?login=rishi-jat");
      const res = await handler(req);
      expect(res.status).toBe(HTTP_STATUS_OK);
      const body = await readJson<BonusResponse>(res);
      expect(body.total_bonus_points).toBe(15);
      expect(body.entries[0].reason).toBe("(no reason)");
    });
  });

  describe("Caching & Authenticated Fetch Operations", () => {
    it("caches downstream results and avoids redundant fetch calls", async () => {
      mockFetch.mockImplementation(() => new Response("[]", {
        status: 200,
        headers: { "content-length": "2" },
      }));

      // Request 1: hits GitHub API
      const res1 = await handler(makeNetlifyRequest("/.netlify/functions/bonus-points?login=rishi-jat"));
      expect(res1.status).toBe(HTTP_STATUS_OK);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Request 2: serves directly from cache
      const res2 = await handler(makeNetlifyRequest("/.netlify/functions/bonus-points?login=rishi-jat"));
      expect(res2.status).toBe(HTTP_STATUS_OK);
      expect(mockFetch).toHaveBeenCalledTimes(1); // Call count remains 1!
    });

    it("bypasses cache when resetCache() is executed", async () => {
      mockFetch.mockImplementation(() => new Response("[]", {
        status: 200,
        headers: { "content-length": "2" },
      }));

      await handler(makeNetlifyRequest("/.netlify/functions/bonus-points?login=rishi-jat"));
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Reset cache manually
      resetCache();

      // Request 2: hits GitHub API again
      await handler(makeNetlifyRequest("/.netlify/functions/bonus-points?login=rishi-jat"));
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("applies GITHUB_TOKEN Authorization header when configured in env", async () => {
      mockFetch.mockImplementation(() => new Response("[]", {
        status: 200,
        headers: { "content-length": "2" },
      }));

      await handler(makeNetlifyRequest("/.netlify/functions/bonus-points?login=rishi-jat"));
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const firstCallInit = mockFetch.mock.calls[0][1];
      const headers = new Headers(firstCallInit.headers);
      expect(headers.get("authorization")).toBe(`Bearer ${FAKE_GITHUB_TOKEN}`);
    });
  });

  describe("Error Handling & Protection Against Exception Leaking", () => {
    it("returns 502 with clean error response when GitHub API rejects with 4xx", async () => {
      mockFetch.mockResolvedValue(new Response("", {
        status: 403,
        statusText: "Rate limit exceeded",
      }));

      const req = makeNetlifyRequest("/.netlify/functions/bonus-points?login=rishi-jat");
      const res = await handler(req);
      expect(res.status).toBe(HTTP_STATUS_BAD_GATEWAY);
      const body = await readJson<{ error: string }>(res);
      expect(body.error).toBe("Internal server error");
    });

    it("returns 502 with clean error response when response payload exceeds limit", async () => {
      const oversizedLength = MAX_RESPONSE_BYTES + 1;
      mockFetch.mockResolvedValue(new Response("a".repeat(oversizedLength), {
        status: 200,
        headers: { "content-length": String(oversizedLength) },
      }));

      const req = makeNetlifyRequest("/.netlify/functions/bonus-points?login=rishi-jat");
      const res = await handler(req);
      expect(res.status).toBe(HTTP_STATUS_BAD_GATEWAY);
      const body = await readJson<{ error: string }>(res);
      expect(body.error).toBe("Internal server error");
      // Assert raw exception details are never leaked
      assertResponseHasNoSecrets(JSON.stringify(body), ["Response too large"]);
    });

    it("returns 502 with clean error response when fetch fails globally (network timeout)", async () => {
      const rawErrorMessage = "Network connection timeout to api.github.com:443";
      mockFetch.mockRejectedValue(new Error(rawErrorMessage));

      const req = makeNetlifyRequest("/.netlify/functions/bonus-points?login=rishi-jat");
      const res = await handler(req);
      expect(res.status).toBe(HTTP_STATUS_BAD_GATEWAY);
      const body = await readJson<{ error: string }>(res);
      expect(body.error).toBe("Internal server error");
      // Assert raw exception details are never leaked
      assertResponseHasNoSecrets(JSON.stringify(body), [rawErrorMessage]);
    });
  });
});
