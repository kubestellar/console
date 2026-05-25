/**
 * Vitest unit tests for nps.mts Netlify function (#15633, Part of #4189).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  TEST_CORS_ORIGIN,
  makeNetlifyRequest,
  readJson,
  assertResponseHasNoSecrets,
} from "./netlify-handler-helpers";
import handler, { MAX_BODY_BYTES } from "../nps.mts";

// Named constants for HTTP status codes to avoid magic numbers
const HTTP_STATUS_OK = 200;
const HTTP_STATUS_CREATED = 201;
const HTTP_STATUS_NO_CONTENT = 204;
const HTTP_STATUS_BAD_REQUEST = 400;
const HTTP_STATUS_METHOD_NOT_ALLOWED = 405;
const HTTP_STATUS_REQUEST_TOO_LARGE = 413;
const HTTP_STATUS_RATE_LIMITED = 429;
const HTTP_STATUS_INTERNAL_SERVER_ERROR = 500;

// Types matching the NPS aggregate structure for absolute type safety
interface NpsTrendItem {
  month: string;
  npsScore: number;
  count: number;
  avgScore: number;
}

interface NpsRecentItem {
  score: number;
  category: string;
  feedback?: string;
  timestamp: string;
}

interface NpsAggregation {
  totalResponses: number;
  npsScore: number;
  promoters: number;
  passives: number;
  detractors: number;
  promoterPct: number;
  passivePct: number;
  detractorPct: number;
  averageScore: number;
  scoreMax: number;
  trend: NpsTrendItem[];
  recent: NpsRecentItem[];
}

// Hoisted mocks for Netlify Blobs
const { mockGet, mockSet } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockSet: vi.fn(),
}));

vi.mock("@netlify/blobs", () => ({
  getStore: () => ({
    get: mockGet,
    set: mockSet,
  }),
}));

// Hoisted mock for enforceSimpleRateLimit
const { mockEnforceSimpleRateLimit } = vi.hoisted(() => ({
  mockEnforceSimpleRateLimit: vi.fn(),
}));

vi.mock("../_shared/rate-limit", () => ({
  enforceSimpleRateLimit: mockEnforceSimpleRateLimit,
}));

// Handler import is now situated at the top of the test file

describe("nps", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue(null);
    mockSet.mockResolvedValue(undefined);
    mockEnforceSimpleRateLimit.mockResolvedValue({ limited: false, retryAfterSeconds: 0 });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("CORS & HTTP Method validation", () => {
    it("returns 204 / CORS response for OPTIONS preflight", async () => {
      const req = makeNetlifyRequest("/.netlify/functions/nps", {
        method: "OPTIONS",
      });
      const res = await handler(req);
      expect(res.status).toBe(HTTP_STATUS_NO_CONTENT);
      expect(res.headers.get("access-control-allow-origin")).toBe(TEST_CORS_ORIGIN);
      expect(res.headers.get("access-control-allow-methods")).toContain("GET, POST, OPTIONS");
    });

    it("returns 405 for unsupported HTTP methods", async () => {
      const req = makeNetlifyRequest("/.netlify/functions/nps", {
        method: "PUT",
      });
      const res = await handler(req);
      expect(res.status).toBe(HTTP_STATUS_METHOD_NOT_ALLOWED);
      const body = await readJson<{ error: string }>(res);
      expect(body.error).toBe("Method not allowed");
    });
  });

  describe("Rate Limiting & Payload Limits", () => {
    it("returns 429 when simple rate limit is exceeded on POST", async () => {
      mockEnforceSimpleRateLimit.mockResolvedValue({ limited: true, retryAfterSeconds: 86400 });
      const req = new Request("https://example.test/.netlify/functions/nps", {
        method: "POST",
        headers: {
          Origin: TEST_CORS_ORIGIN,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ score: 4 }),
      });
      const res = await handler(req);
      expect(res.status).toBe(HTTP_STATUS_RATE_LIMITED);
      const body = await readJson<{ error: string }>(res);
      expect(body.error).toBe("Rate limit exceeded");
    });

    it("returns 413 when content-length header exceeds MAX_BODY_BYTES limit", async () => {
      const hugeBodyLength = MAX_BODY_BYTES + 1;
      const hugeBody = "a".repeat(hugeBodyLength);
      const req = new Request("https://example.test/.netlify/functions/nps", {
        method: "POST",
        headers: {
          Origin: TEST_CORS_ORIGIN,
          "Content-Type": "application/json",
          "content-length": String(hugeBodyLength),
        },
        body: hugeBody,
      });
      const res = await handler(req);
      expect(res.status).toBe(HTTP_STATUS_REQUEST_TOO_LARGE);
      const body = await readJson<{ error: string }>(res);
      expect(body.error).toBe("Payload too large");
    });
  });

  describe("POST Input Range & PII Stripping Validation", () => {
    it("returns 400 when score is below 1", async () => {
      const req = new Request("https://example.test/.netlify/functions/nps", {
        method: "POST",
        headers: {
          Origin: TEST_CORS_ORIGIN,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ score: 0 }),
      });
      const res = await handler(req);
      expect(res.status).toBe(HTTP_STATUS_BAD_REQUEST);
      const body = await readJson<{ error: string }>(res);
      expect(body.error).toBe("Score must be 1-4");
    });

    it("returns 400 when score is above 4", async () => {
      const req = new Request("https://example.test/.netlify/functions/nps", {
        method: "POST",
        headers: {
          Origin: TEST_CORS_ORIGIN,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ score: 5 }),
      });
      const res = await handler(req);
      expect(res.status).toBe(HTTP_STATUS_BAD_REQUEST);
      const body = await readJson<{ error: string }>(res);
      expect(body.error).toBe("Score must be 1-4");
    });

    it("returns 400 when score is non-numeric/NaN", async () => {
      const req = new Request("https://example.test/.netlify/functions/nps", {
        method: "POST",
        headers: {
          Origin: TEST_CORS_ORIGIN,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ score: "not-a-number" }),
      });
      const res = await handler(req);
      expect(res.status).toBe(HTTP_STATUS_BAD_REQUEST);
      const body = await readJson<{ error: string }>(res);
      expect(body.error).toBe("Score must be 1-4");
    });

    it("persists valid score and strips out all unauthorized/PII fields", async () => {
      const piiSecret = "gaurav@example.com";
      const req = new Request("https://example.test/.netlify/functions/nps", {
        method: "POST",
        headers: {
          Origin: TEST_CORS_ORIGIN,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          score: 4,
          feedback: "Extremely robust interface!",
          sessionId: "active-session-123",
          email: piiSecret, // Extraneous PII field that must be stripped!
          username: "gauravc", // Extraneous PII field that must be stripped!
        }),
      });

      const res = await handler(req);
      expect(res.status).toBe(HTTP_STATUS_CREATED);
      const body = await readJson<{ ok: boolean; category: string }>(res);
      expect(body.ok).toBe(true);
      expect(body.category).toBe("promoter");

      expect(mockSet).toHaveBeenCalledTimes(1);
      const savedKey = mockSet.mock.calls[0][0];
      const savedValue = mockSet.mock.calls[0][1] as string;
      expect(savedKey).toBe("all-responses");

      const savedData = JSON.parse(savedValue);
      expect(savedData.responses).toHaveLength(1);
      const storedResponse = savedData.responses[0];
      expect(storedResponse.score).toBe(4);
      expect(storedResponse.category).toBe("promoter");
      expect(storedResponse.feedback).toBe("Extremely robust interface!");
      expect(storedResponse.sessionId).toBe("active-session-123");
      expect(storedResponse.timestamp).toBeDefined();

      // Ensure extraneous fields (PII) are completely stripped and never saved
      expect(storedResponse.email).toBeUndefined();
      expect(storedResponse.username).toBeUndefined();
      assertResponseHasNoSecrets(savedValue, [piiSecret, "gauravc"]);
    });
  });

  describe("GET Aggregations", () => {
    it("returns zeroed aggregation on empty blob storage", async () => {
      const req = makeNetlifyRequest("/.netlify/functions/nps");
      const res = await handler(req);
      expect(res.status).toBe(HTTP_STATUS_OK);
      const aggregation = await readJson<NpsAggregation>(res);
      expect(aggregation).toEqual({
        totalResponses: 0,
        npsScore: 0,
        promoters: 0,
        passives: 0,
        detractors: 0,
        promoterPct: 0,
        passivePct: 0,
        detractorPct: 0,
        averageScore: 0,
        scoreMax: 4,
        trend: [],
        recent: [],
      });
    });

    it("correctly computes NPS scoring, trend averages, and strips sessionId from recent lists", async () => {
      const mockDatabase = {
        responses: [
          { score: 4, category: "promoter", timestamp: "2026-04-10T12:00:00Z", sessionId: "s1" },
          { score: 1, category: "detractor", timestamp: "2026-04-12T12:00:00Z", sessionId: "s2" },
          { score: 2, category: "passive", timestamp: "2026-05-01T12:00:00Z", sessionId: "s3", feedback: "Decent tool" },
          { score: 3, category: "passive", timestamp: "2026-05-02T12:00:00Z", sessionId: "s4" },
        ],
      };
      mockGet.mockResolvedValue(JSON.stringify(mockDatabase));

      const req = makeNetlifyRequest("/.netlify/functions/nps");
      const res = await handler(req);
      expect(res.status).toBe(HTTP_STATUS_OK);
      const aggregation = await readJson<NpsAggregation>(res);

      expect(aggregation.totalResponses).toBe(4);
      // Promoters: 1, Detractors: 1, Passives: 2
      // NPS Score = Math.round(((1 - 1) / 4) * 100) = 0
      expect(aggregation.npsScore).toBe(0);
      expect(aggregation.promoters).toBe(1);
      expect(aggregation.passives).toBe(2);
      expect(aggregation.detractors).toBe(1);
      expect(aggregation.promoterPct).toBe(25);
      expect(aggregation.passivePct).toBe(50);
      expect(aggregation.detractorPct).toBe(25);
      // Average score: (4 + 1 + 2 + 3) / 4 = 2.5
      expect(aggregation.averageScore).toBe(2.5);

      // Verify trend computation
      // April 2026: Promoter (4), Detractor (1) -> Count 2 -> Avg (4+1)/2 = 2.5 -> NPS 0
      // May 2026: Passive (2), Passive (3) -> Count 2 -> Avg (2+3)/2 = 2.5 -> NPS 0
      expect(aggregation.trend).toHaveLength(2);
      expect(aggregation.trend[0]).toEqual({
        month: "2026-04",
        npsScore: 0,
        count: 2,
        avgScore: 2.5,
      });
      expect(aggregation.trend[1]).toEqual({
        month: "2026-05",
        npsScore: 0,
        count: 2,
        avgScore: 2.5,
      });

      // Verify recent list mapping (should reverse order and omit sessionIds entirely)
      expect(aggregation.recent).toHaveLength(4);
      expect(aggregation.recent[0].score).toBe(3);
      expect(aggregation.recent[0].category).toBe("passive");
      expect(aggregation.recent[0].sessionId).toBeUndefined();

      expect(aggregation.recent[1].score).toBe(2);
      expect(aggregation.recent[1].feedback).toBe("Decent tool");
      expect(aggregation.recent[1].sessionId).toBeUndefined();

      assertResponseHasNoSecrets(JSON.stringify(aggregation), ["s1", "s2", "s3", "s4"]);
    });
  });

  describe("Error Handling & Protection against exception leaking", () => {
    it("returns 500 when request body contains malformed JSON", async () => {
      const req = new Request("https://example.test/.netlify/functions/nps", {
        method: "POST",
        headers: {
          Origin: TEST_CORS_ORIGIN,
          "Content-Type": "application/json",
        },
        body: "invalid-json-body{",
      });
      const res = await handler(req);
      expect(res.status).toBe(HTTP_STATUS_INTERNAL_SERVER_ERROR);
      const body = await readJson<{ error: string }>(res);
      expect(body.error).toBe("Internal server error");
    });

    it("returns 500 with safe generic error when Blob store write rejects, preventing exception leak", async () => {
      const rawWriteErrorMessage = "Fatal connection rejection in database cluster 0x9923";
      mockSet.mockRejectedValue(new Error(rawWriteErrorMessage));

      const req = new Request("https://example.test/.netlify/functions/nps", {
        method: "POST",
        headers: {
          Origin: TEST_CORS_ORIGIN,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ score: 4 }),
      });

      const res = await handler(req);
      expect(res.status).toBe(HTTP_STATUS_INTERNAL_SERVER_ERROR);
      const body = await readJson<{ error: string }>(res);
      expect(body.error).toBe("Internal server error");
      // Assert raw exception details are never returned in response body
      assertResponseHasNoSecrets(JSON.stringify(body), [rawWriteErrorMessage]);
    });

    it("returns 500 with safe generic error when Blob store read rejects on GET, preventing exception leak", async () => {
      const rawReadErrorMessage = "Failed reading from netlify blob store storage replication";
      mockGet.mockRejectedValue(new Error(rawReadErrorMessage));

      const req = makeNetlifyRequest("/.netlify/functions/nps");
      const res = await handler(req);
      expect(res.status).toBe(HTTP_STATUS_INTERNAL_SERVER_ERROR);
      const body = await readJson<{ error: string }>(res);
      expect(body.error).toBe("Internal server error");
      // Assert raw exception details are never returned in response body
      assertResponseHasNoSecrets(JSON.stringify(body), [rawReadErrorMessage]);
    });
  });
});
