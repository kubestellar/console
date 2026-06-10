// @vitest-environment node
/**
 * Unit tests for the in-memory rate limiter.
 *
 * The in-memory rate limiter is used across multiple Netlify Functions as
 * a first line of defense against abuse (CWE-400). These tests verify
 * every code path: first request, window expiry, limit enforcement,
 * consume/no-consume mode, pruning, and client-IP extraction.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import {
  checkInMemoryRateLimit,
  getClientIp,
  type InMemoryRateLimitEntry,
} from "../_shared/inMemoryRateLimit";

// ── Constants ───────────────────────────────────────────────────────────

const MAX_REQUESTS = 3;
const WINDOW_MS = 60_000;

// ── getClientIp ─────────────────────────────────────────────────────────

describe("getClientIp", () => {
  it("returns x-nf-client-connection-ip header value", () => {
    const req = new Request("https://example.com", {
      headers: { "x-nf-client-connection-ip": "1.2.3.4" },
    });
    expect(getClientIp(req)).toBe("1.2.3.4");
  });

  it("returns default subject when header is missing", () => {
    const req = new Request("https://example.com");
    expect(getClientIp(req)).toBe("untrusted-client");
  });
});

// ── checkInMemoryRateLimit ──────────────────────────────────────────────

describe("checkInMemoryRateLimit", () => {
  let rateLimitMap: Map<string, InMemoryRateLimitEntry>;

  beforeEach(() => {
    rateLimitMap = new Map();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("first request", () => {
    it("allows the first request and creates an entry", () => {
      const result = checkInMemoryRateLimit(
        "user-1",
        rateLimitMap,
        MAX_REQUESTS,
        WINDOW_MS,
      );
      expect(result.allowed).toBe(true);
      expect(result.retryAfterSeconds).toBe(0);
      expect(rateLimitMap.has("user-1")).toBe(true);
      expect(rateLimitMap.get("user-1")!.count).toBe(1);
    });

    it("uses default subject for empty string", () => {
      const result = checkInMemoryRateLimit(
        "",
        rateLimitMap,
        MAX_REQUESTS,
        WINDOW_MS,
      );
      expect(result.allowed).toBe(true);
      expect(rateLimitMap.has("untrusted-client")).toBe(true);
    });
  });

  describe("under limit", () => {
    it("allows requests up to the limit", () => {
      for (let i = 0; i < MAX_REQUESTS; i++) {
        const result = checkInMemoryRateLimit(
          "user-1",
          rateLimitMap,
          MAX_REQUESTS,
          WINDOW_MS,
        );
        expect(result.allowed).toBe(true);
      }
      expect(rateLimitMap.get("user-1")!.count).toBe(MAX_REQUESTS);
    });
  });

  describe("at limit", () => {
    it("denies requests exceeding the limit", () => {
      // Exhaust the limit
      for (let i = 0; i < MAX_REQUESTS; i++) {
        checkInMemoryRateLimit(
          "user-1",
          rateLimitMap,
          MAX_REQUESTS,
          WINDOW_MS,
        );
      }

      // Next request should be denied
      const result = checkInMemoryRateLimit(
        "user-1",
        rateLimitMap,
        MAX_REQUESTS,
        WINDOW_MS,
      );
      expect(result.allowed).toBe(false);
      expect(result.retryAfterSeconds).toBeGreaterThan(0);
    });

    it("returns retryAfterSeconds > 0 when limited", () => {
      for (let i = 0; i < MAX_REQUESTS; i++) {
        checkInMemoryRateLimit(
          "user-1",
          rateLimitMap,
          MAX_REQUESTS,
          WINDOW_MS,
        );
      }

      // Advance 30 seconds into the window
      vi.advanceTimersByTime(30_000);

      const result = checkInMemoryRateLimit(
        "user-1",
        rateLimitMap,
        MAX_REQUESTS,
        WINDOW_MS,
      );
      expect(result.allowed).toBe(false);
      // Should be ~30 seconds remaining
      expect(result.retryAfterSeconds).toBeGreaterThanOrEqual(1);
      expect(result.retryAfterSeconds).toBeLessThanOrEqual(31);
    });
  });

  describe("window expiry", () => {
    it("resets after window expires", () => {
      // Exhaust the limit
      for (let i = 0; i < MAX_REQUESTS; i++) {
        checkInMemoryRateLimit(
          "user-1",
          rateLimitMap,
          MAX_REQUESTS,
          WINDOW_MS,
        );
      }

      // Confirm denied
      expect(
        checkInMemoryRateLimit(
          "user-1",
          rateLimitMap,
          MAX_REQUESTS,
          WINDOW_MS,
        ).allowed,
      ).toBe(false);

      // Advance past the window
      vi.advanceTimersByTime(WINDOW_MS + 1);

      // Should be allowed again
      const result = checkInMemoryRateLimit(
        "user-1",
        rateLimitMap,
        MAX_REQUESTS,
        WINDOW_MS,
      );
      expect(result.allowed).toBe(true);
      expect(rateLimitMap.get("user-1")!.count).toBe(1);
    });
  });

  describe("consume option", () => {
    it("does not consume when consume=false on first request", () => {
      const result = checkInMemoryRateLimit(
        "user-1",
        rateLimitMap,
        MAX_REQUESTS,
        WINDOW_MS,
        { consume: false },
      );
      expect(result.allowed).toBe(true);
      expect(rateLimitMap.has("user-1")).toBe(false);
    });

    it("does not increment count when consume=false", () => {
      // Make one consumed request
      checkInMemoryRateLimit(
        "user-1",
        rateLimitMap,
        MAX_REQUESTS,
        WINDOW_MS,
      );
      expect(rateLimitMap.get("user-1")!.count).toBe(1);

      // Check without consuming
      const result = checkInMemoryRateLimit(
        "user-1",
        rateLimitMap,
        MAX_REQUESTS,
        WINDOW_MS,
        { consume: false },
      );
      expect(result.allowed).toBe(true);
      expect(rateLimitMap.get("user-1")!.count).toBe(1);
    });

    it("does not create entry on window expiry when consume=false", () => {
      // Create and expire an entry
      checkInMemoryRateLimit(
        "user-1",
        rateLimitMap,
        MAX_REQUESTS,
        WINDOW_MS,
      );
      vi.advanceTimersByTime(WINDOW_MS + 1);

      const result = checkInMemoryRateLimit(
        "user-1",
        rateLimitMap,
        MAX_REQUESTS,
        WINDOW_MS,
        { consume: false },
      );
      expect(result.allowed).toBe(true);
      expect(rateLimitMap.has("user-1")).toBe(false);
    });
  });

  describe("subject isolation", () => {
    it("tracks subjects independently", () => {
      for (let i = 0; i < MAX_REQUESTS; i++) {
        checkInMemoryRateLimit(
          "user-1",
          rateLimitMap,
          MAX_REQUESTS,
          WINDOW_MS,
        );
      }

      // user-1 is at limit
      expect(
        checkInMemoryRateLimit(
          "user-1",
          rateLimitMap,
          MAX_REQUESTS,
          WINDOW_MS,
        ).allowed,
      ).toBe(false);

      // user-2 should still be allowed
      expect(
        checkInMemoryRateLimit(
          "user-2",
          rateLimitMap,
          MAX_REQUESTS,
          WINDOW_MS,
        ).allowed,
      ).toBe(true);
    });
  });

  describe("pruning", () => {
    it("prunes expired entries when map reaches MAX_TRACKED_SUBJECTS", () => {
      const MAX_TRACKED = 1_000;

      // Fill the map to capacity with expired entries
      const expiredResetAt = Date.now() - 1;
      for (let i = 0; i < MAX_TRACKED; i++) {
        rateLimitMap.set(`expired-${i}`, {
          count: 1,
          resetAt: expiredResetAt,
        });
      }
      expect(rateLimitMap.size).toBe(MAX_TRACKED);

      // Next call should trigger pruning
      checkInMemoryRateLimit(
        "new-user",
        rateLimitMap,
        MAX_REQUESTS,
        WINDOW_MS,
      );

      // Expired entries should be removed
      expect(rateLimitMap.size).toBeLessThan(MAX_TRACKED);
      expect(rateLimitMap.has("new-user")).toBe(true);
    });

    it("does not prune when below MAX_TRACKED_SUBJECTS", () => {
      // Add a few entries
      const expiredResetAt = Date.now() - 1;
      rateLimitMap.set("expired-1", { count: 1, resetAt: expiredResetAt });
      rateLimitMap.set("expired-2", { count: 1, resetAt: expiredResetAt });

      checkInMemoryRateLimit(
        "new-user",
        rateLimitMap,
        MAX_REQUESTS,
        WINDOW_MS,
      );

      // Expired entries should still be present (no pruning needed)
      expect(rateLimitMap.has("expired-1")).toBe(true);
      expect(rateLimitMap.has("expired-2")).toBe(true);
    });
  });
});
