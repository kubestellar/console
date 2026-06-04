// @vitest-environment node
/**
 * @vitest-environment node
 *
 * Vitest unit tests for presence.mts Netlify function (#15635, Part of #4189).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  TEST_CORS_ORIGIN,
  makeNetlifyRequest,
  readJson,
} from "./netlify-handler-helpers";
import handler, { _testOnly } from "../presence.mts";

const { MAX_BODY_BYTES } = _testOnly;

// Named constants for HTTP status codes to avoid magic numbers
const HTTP_STATUS_OK = 200;
const HTTP_STATUS_NO_CONTENT = 204;
const HTTP_STATUS_BAD_REQUEST = 400;
const HTTP_STATUS_METHOD_NOT_ALLOWED = 405;
const HTTP_STATUS_REQUEST_TOO_LARGE = 413;
const HTTP_STATUS_RATE_LIMITED = 429;
const HTTP_STATUS_INTERNAL_SERVER_ERROR = 500;

// Type definitions matching the API contract for absolute type safety
interface PresenceAggregation {
  activeUsers: number;
  totalConnections: number;
}

// In-memory key-value database simulator
const mockStoreData = new Map<string, string>();

// Hoisted mocks for Netlify Blobs
const { mockGet, mockSet, mockDelete, mockList } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockSet: vi.fn(),
  mockDelete: vi.fn(),
  mockList: vi.fn(),
}));

vi.mock("@netlify/blobs", () => ({
  getStore: () => ({
    get: mockGet,
    set: mockSet,
    delete: mockDelete,
    list: mockList,
  }),
}));

// Hoisted mock for enforceSimpleRateLimit
const { mockEnforceSimpleRateLimit } = vi.hoisted(() => ({
  mockEnforceSimpleRateLimit: vi.fn(),
}));

vi.mock("../_shared/rate-limit", () => ({
  enforceSimpleRateLimit: mockEnforceSimpleRateLimit,
}));

describe("presence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStoreData.clear();
    mockEnforceSimpleRateLimit.mockResolvedValue({ limited: false, retryAfterSeconds: 0 });

    // Stateful DB Simulation
    mockGet.mockImplementation(async (key: string) => {
      return mockStoreData.get(key) ?? null;
    });

    mockSet.mockImplementation(async (key: string, value: string) => {
      mockStoreData.set(key, value);
      return undefined;
    });

    mockDelete.mockImplementation(async (key: string) => {
      mockStoreData.delete(key);
      return undefined;
    });

    mockList.mockImplementation((opts = {}) => {
      const { prefix, paginate } = opts;
      const matchedKeys = Array.from(mockStoreData.keys())
        .filter((key) => !prefix || key.startsWith(prefix));
      const matchedBlobs = matchedKeys.map((key) => ({
        key,
        etag: "mock-etag",
      }));

      if (paginate) {
        return {
          [Symbol.asyncIterator]() {
            let done = false;
            return {
              async next() {
                if (done) {
                  return { done: true, value: undefined };
                }
                done = true;
                return { done: false, value: { blobs: matchedBlobs } };
              },
            };
          },
        };
      }

      return Promise.resolve({ blobs: matchedBlobs });
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("CORS & HTTP Method Validation", () => {
    it("returns 204 for OPTIONS preflight with allowlisted origin", async () => {
      const req = makeNetlifyRequest("/.netlify/functions/presence", {
        method: "OPTIONS",
        headers: { Origin: "https://console.kubestellar.io" },
      });
      const res = await handler(req);
      expect(res.status).toBe(HTTP_STATUS_NO_CONTENT);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://console.kubestellar.io");
      expect(res.headers.get("Access-Control-Allow-Methods")).toBe("GET, POST, OPTIONS");
    });

    it("returns 204 for OPTIONS preflight with unlisted origin (completes without Access-Control-Allow-Origin)", async () => {
      const req = makeNetlifyRequest("/.netlify/functions/presence", {
        method: "OPTIONS",
        headers: { Origin: "https://unlisted-malicious-site.com" },
      });
      const res = await handler(req);
      expect(res.status).toBe(HTTP_STATUS_NO_CONTENT);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
    });

    it("returns 405 for unsupported HTTP methods", async () => {
      const req = makeNetlifyRequest("/.netlify/functions/presence", {
        method: "PUT",
      });
      const res = await handler(req);
      expect(res.status).toBe(HTTP_STATUS_METHOD_NOT_ALLOWED);
      const body = await readJson<{ error: string }>(res);
      expect(body.error).toBe("Method not allowed");
    });
  });

  describe("Rate Limiting & Payload Constraints", () => {
    it("returns 429 when write rate limit is exceeded on POST", async () => {
      mockEnforceSimpleRateLimit.mockResolvedValue({ limited: true, retryAfterSeconds: 300 });
      const req = new Request("https://example.test/.netlify/functions/presence", {
        method: "POST",
        headers: {
          Origin: TEST_CORS_ORIGIN,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sessionId: "user-1" }),
      });
      const res = await handler(req);
      expect(res.status).toBe(HTTP_STATUS_RATE_LIMITED);
      const body = await readJson<{ error: string; retryAfter: number }>(res);
      expect(body.error).toBe("Rate limit exceeded");
      expect(body.retryAfter).toBe(300);
      expect(res.headers.get("Retry-After")).toBe("300");
    });

    it("returns 429 when read rate limit is exceeded on GET", async () => {
      mockEnforceSimpleRateLimit.mockResolvedValue({ limited: true, retryAfterSeconds: 60 });
      const req = makeNetlifyRequest("/.netlify/functions/presence");
      const res = await handler(req);
      expect(res.status).toBe(HTTP_STATUS_RATE_LIMITED);
      const body = await readJson<{ error: string }>(res);
      expect(body.error).toBe("Rate limit exceeded");
    });

    it("returns 413 when content-length header exceeds MAX_BODY_BYTES", async () => {
      const hugeBodyLength = MAX_BODY_BYTES + 1;
      const hugeBody = "a".repeat(hugeBodyLength);
      const req = new Request("https://example.test/.netlify/functions/presence", {
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
      const text = await res.text();
      expect(text).toBe("Payload too large");
    });
  });

  describe("POST Session Registration & Missing Inputs", () => {
    it("successfully registers valid session ID and returns 204", async () => {
      vi.spyOn(Date, "now").mockReturnValue(120_000); // Bucket 4

      const req = new Request("https://example.test/.netlify/functions/presence", {
        method: "POST",
        headers: {
          Origin: TEST_CORS_ORIGIN,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sessionId: "gaurav-session" }),
      });
      const res = await handler(req);
      expect(res.status).toBe(HTTP_STATUS_NO_CONTENT);

      // Verify stored bucket key matches logic: session-4-gaurav-session
      expect(mockStoreData.get("session-4-gaurav-session")).toBe("120000");
    });

    it("returns 204 when session ID is missing or invalid (no crash)", async () => {
      const req = new Request("https://example.test/.netlify/functions/presence", {
        method: "POST",
        headers: {
          Origin: TEST_CORS_ORIGIN,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sessionId: "" }), // empty / invalid
      });
      const res = await handler(req);
      expect(res.status).toBe(HTTP_STATUS_NO_CONTENT);
      expect(mockStoreData.size).toBe(0);
    });

    it("returns 204 when payload contains malformed JSON", async () => {
      const req = new Request("https://example.test/.netlify/functions/presence", {
        method: "POST",
        headers: {
          Origin: TEST_CORS_ORIGIN,
          "Content-Type": "application/json",
        },
        body: "invalid-json-payload{",
      });
      const res = await handler(req);
      expect(res.status).toBe(HTTP_STATUS_NO_CONTENT);
      expect(mockStoreData.size).toBe(0);
    });
  });

  describe("GET Presence Aggregation & Expired TTL Cleanup", () => {
    it("returns zeroed active user stats on empty database", async () => {
      const req = makeNetlifyRequest("/.netlify/functions/presence");
      const res = await handler(req);
      expect(res.status).toBe(HTTP_STATUS_OK);
      const body = await readJson<PresenceAggregation>(res);
      expect(body.activeUsers).toBe(0);
      expect(body.totalConnections).toBe(0);
    });

    it("correctly deduplicates multiple listings of the same session ID across active buckets", async () => {
      vi.spyOn(Date, "now").mockReturnValue(120_000); // Bucket 4

      // Populate store with sessions:
      // Active buckets window for bucket 4 goes back Math.ceil(90000 / 30000) + 1 = 4 buckets.
      // So oldest active bucket is Math.max(0, 4 - 4 + 1) = 1. Active range is bucket 1 to 4.
      mockStoreData.set("session-1-user-a", "30000");  // bucket 1
      mockStoreData.set("session-2-user-a", "60000");  // bucket 2 (same user-a)
      mockStoreData.set("session-3-user-b", "90000");  // bucket 3 (user-b)
      mockStoreData.set("session-4-user-c", "120000"); // bucket 4 (user-c)

      const req = makeNetlifyRequest("/.netlify/functions/presence");
      const res = await handler(req);
      expect(res.status).toBe(HTTP_STATUS_OK);
      const body = await readJson<PresenceAggregation>(res);

      // Unique user count should be 3 (user-a, user-b, user-c)
      expect(body.activeUsers).toBe(3);
      expect(body.totalConnections).toBe(3);
    });

    it("cleans up expired TTL buckets older than the active window", async () => {
      // Math.ceil(90000 / 30000) + 1 = 4 buckets.
      // If currentBucket is 6, newestExpiredBucket = 6 - 4 = 2.
      vi.spyOn(Date, "now").mockReturnValue(180_000); // Bucket 6

      // session-2-old-user is expired (bucket 2 is older than active window [3..6])
      mockStoreData.set("session-2-old-user", "60000");
      mockStoreData.set("session-5-active-user", "150000");

      const req = makeNetlifyRequest("/.netlify/functions/presence");
      const res = await handler(req);
      expect(res.status).toBe(HTTP_STATUS_OK);

      // Verify that the GET operation triggered expired bucket deletion
      expect(mockStoreData.get("session-2-old-user")).toBeUndefined();
      expect(mockStoreData.get("session-5-active-user")).toBe("150000");

      // Verify active count excludes bucket 2 and matches active session in bucket 5 (activeUsers: 1)
      const body = await readJson<PresenceAggregation>(res);
      expect(body.activeUsers).toBe(1);
    });
  });
});
