/**
 * Unit tests for inMemoryRateLimit.ts (#16109).
 * Tests rate limiting logic, IP extraction, expiry, and cleanup.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  checkInMemoryRateLimit,
  getClientIp,
  type InMemoryRateLimitEntry,
} from "../inMemoryRateLimit";

const WINDOW_MS = 1000;
const MAX_REQUESTS = 3;

describe("inMemoryRateLimit", () => {
  describe("getClientIp", () => {
    it("should extract IP from x-nf-client-connection-ip header", () => {
      const request = new Request("http://example.com", {
        headers: { "x-nf-client-connection-ip": "203.0.113.1" },
      });
      expect(getClientIp(request)).toBe("203.0.113.1");
    });

    it("should ignore x-forwarded-for when Netlify header is absent", () => {
      const request = new Request("http://example.com", {
        headers: { "x-forwarded-for": "198.51.100.1, 192.0.2.1" },
      });
      expect(getClientIp(request)).toBe("untrusted-client");
    });

    it("should prefer Netlify header over spoofable forwarded headers", () => {
      const request = new Request("http://example.com", {
        headers: {
          "x-nf-client-connection-ip": "203.0.113.1",
          "x-forwarded-for": "198.51.100.1",
          "x-real-ip": "192.0.2.25",
        },
      });
      expect(getClientIp(request)).toBe("203.0.113.1");
    });

    it("should return the untrusted sentinel when no trusted IP header is present", () => {
      const request = new Request("http://example.com");
      expect(getClientIp(request)).toBe("untrusted-client");
    });
  });

  describe("checkInMemoryRateLimit", () => {
    let rateLimitMap: Map<string, InMemoryRateLimitEntry>;

    beforeEach(() => {
      rateLimitMap = new Map();
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should allow first request and initialize entry", () => {
      const result = checkInMemoryRateLimit("user1", rateLimitMap, MAX_REQUESTS, WINDOW_MS);
      expect(result.allowed).toBe(true);
      expect(result.retryAfterSeconds).toBe(0);
      expect(rateLimitMap.has("user1")).toBe(true);
      expect(rateLimitMap.get("user1")?.count).toBe(1);
    });

    it("should allow requests within limit", () => {
      checkInMemoryRateLimit("user1", rateLimitMap, MAX_REQUESTS, WINDOW_MS);
      const result2 = checkInMemoryRateLimit("user1", rateLimitMap, MAX_REQUESTS, WINDOW_MS);
      expect(result2.allowed).toBe(true);
      expect(rateLimitMap.get("user1")?.count).toBe(2);

      const result3 = checkInMemoryRateLimit("user1", rateLimitMap, MAX_REQUESTS, WINDOW_MS);
      expect(result3.allowed).toBe(true);
      expect(rateLimitMap.get("user1")?.count).toBe(3);
    });

    it("should block requests exceeding limit", () => {
      checkInMemoryRateLimit("user1", rateLimitMap, MAX_REQUESTS, WINDOW_MS);
      checkInMemoryRateLimit("user1", rateLimitMap, MAX_REQUESTS, WINDOW_MS);
      checkInMemoryRateLimit("user1", rateLimitMap, MAX_REQUESTS, WINDOW_MS);

      const result4 = checkInMemoryRateLimit("user1", rateLimitMap, MAX_REQUESTS, WINDOW_MS);
      expect(result4.allowed).toBe(false);
      expect(result4.retryAfterSeconds).toBeGreaterThan(0);
    });

    it("should return correct retry-after seconds", () => {
      const now = Date.now();
      vi.setSystemTime(now);

      checkInMemoryRateLimit("user1", rateLimitMap, MAX_REQUESTS, WINDOW_MS);
      checkInMemoryRateLimit("user1", rateLimitMap, MAX_REQUESTS, WINDOW_MS);
      checkInMemoryRateLimit("user1", rateLimitMap, MAX_REQUESTS, WINDOW_MS);

      const result = checkInMemoryRateLimit("user1", rateLimitMap, MAX_REQUESTS, WINDOW_MS);
      expect(result.retryAfterSeconds).toBe(1); // ceiling of WINDOW_MS / 1000
    });

    it("should reset counter after window expires", () => {
      const now = Date.now();
      vi.setSystemTime(now);

      checkInMemoryRateLimit("user1", rateLimitMap, MAX_REQUESTS, WINDOW_MS);
      checkInMemoryRateLimit("user1", rateLimitMap, MAX_REQUESTS, WINDOW_MS);
      checkInMemoryRateLimit("user1", rateLimitMap, MAX_REQUESTS, WINDOW_MS);

      // Advance time past the window
      vi.setSystemTime(now + WINDOW_MS + 1);

      const result = checkInMemoryRateLimit("user1", rateLimitMap, MAX_REQUESTS, WINDOW_MS);
      expect(result.allowed).toBe(true);
      expect(rateLimitMap.get("user1")?.count).toBe(1);
    });

    it("should handle multiple subjects independently", () => {
      checkInMemoryRateLimit("user1", rateLimitMap, MAX_REQUESTS, WINDOW_MS);
      checkInMemoryRateLimit("user1", rateLimitMap, MAX_REQUESTS, WINDOW_MS);

      checkInMemoryRateLimit("user2", rateLimitMap, MAX_REQUESTS, WINDOW_MS);

      expect(rateLimitMap.get("user1")?.count).toBe(2);
      expect(rateLimitMap.get("user2")?.count).toBe(1);
    });

    it("should normalize empty subject to default", () => {
      const result = checkInMemoryRateLimit("", rateLimitMap, MAX_REQUESTS, WINDOW_MS);
      expect(result.allowed).toBe(true);
      expect(rateLimitMap.has("untrusted-client")).toBe(true);
    });

    it("should inspect limits without consuming a request", () => {
      const result = checkInMemoryRateLimit("user1", rateLimitMap, MAX_REQUESTS, WINDOW_MS, {
        consume: false,
      });
      expect(result).toEqual({ allowed: true, retryAfterSeconds: 0 });
      expect(rateLimitMap.has("user1")).toBe(false);
    });

    it("should report a blocked subject without incrementing when consume is false", () => {
      rateLimitMap.set("user1", {
        count: MAX_REQUESTS,
        resetAt: Date.now() + WINDOW_MS,
      });

      const result = checkInMemoryRateLimit("user1", rateLimitMap, MAX_REQUESTS, WINDOW_MS, {
        consume: false,
      });
      expect(result.allowed).toBe(false);
      expect(rateLimitMap.get("user1")?.count).toBe(MAX_REQUESTS);
    });

    it("should prune expired entries when map exceeds 1000 subjects", () => {
      const now = Date.now();
      vi.setSystemTime(now);

      // Add 1001 entries, with the first 500 expired
      for (let i = 0; i < 500; i++) {
        rateLimitMap.set(`expired-${i}`, {
          count: 1,
          resetAt: now - 1, // Expired
        });
      }
      for (let i = 0; i < 501; i++) {
        rateLimitMap.set(`active-${i}`, {
          count: 1,
          resetAt: now + WINDOW_MS,
        });
      }

      expect(rateLimitMap.size).toBe(1001);

      checkInMemoryRateLimit("new-user", rateLimitMap, MAX_REQUESTS, WINDOW_MS);

      // Pruning should have removed expired entries
      expect(rateLimitMap.size).toBeLessThan(1001);
      expect(rateLimitMap.has("expired-0")).toBe(false);
      expect(rateLimitMap.has("active-0")).toBe(true);
    });

    it("should not prune when map size is below 1000", () => {
      const now = Date.now();
      vi.setSystemTime(now);

      rateLimitMap.set("expired-user", {
        count: 1,
        resetAt: now - 1000,
      });

      checkInMemoryRateLimit("new-user", rateLimitMap, MAX_REQUESTS, WINDOW_MS);

      // Should not prune since map size < 1000
      expect(rateLimitMap.has("expired-user")).toBe(true);
    });

    it("should handle edge case of exactly max requests allowed", () => {
      for (let i = 0; i < MAX_REQUESTS; i++) {
        const result = checkInMemoryRateLimit("user1", rateLimitMap, MAX_REQUESTS, WINDOW_MS);
        expect(result.allowed).toBe(true);
      }

      const blockedResult = checkInMemoryRateLimit("user1", rateLimitMap, MAX_REQUESTS, WINDOW_MS);
      expect(blockedResult.allowed).toBe(false);
    });

    it("should return retry-after of at least 1 second", () => {
      const now = Date.now();
      vi.setSystemTime(now);

      checkInMemoryRateLimit("user1", rateLimitMap, MAX_REQUESTS, 100); // 100ms window
      checkInMemoryRateLimit("user1", rateLimitMap, MAX_REQUESTS, 100);
      checkInMemoryRateLimit("user1", rateLimitMap, MAX_REQUESTS, 100);

      const result = checkInMemoryRateLimit("user1", rateLimitMap, MAX_REQUESTS, 100);
      expect(result.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    });
  });
});
