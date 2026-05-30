/**
 * Unit tests for rate-limit.ts (#16109).
 * Tests blob-based rate limiting with window management.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { enforceSimpleRateLimit, type SimpleRateLimitOptions } from "../rate-limit";

// Mock @netlify/blobs
const mockGet = vi.fn();
const mockSet = vi.fn();

vi.mock("@netlify/blobs", () => ({
  getStore: vi.fn(() => ({
    get: mockGet,
    set: mockSet,
  })),
}));

const DEFAULT_OPTIONS: SimpleRateLimitOptions = {
  storeName: "test-store",
  prefix: "rl:",
  subject: "user123",
  maxRequests: 5,
  windowMs: 60000,
};

describe("rate-limit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("enforceSimpleRateLimit", () => {
    it("should allow first request and create new entry", async () => {
      mockGet.mockResolvedValueOnce(null);
      mockSet.mockResolvedValueOnce(undefined);

      const result = await enforceSimpleRateLimit(DEFAULT_OPTIONS);

      expect(result.limited).toBe(false);
      expect(result.retryAfterSeconds).toBe(0);
      expect(mockSet).toHaveBeenCalledWith(
        "rl:user123",
        expect.stringContaining('"count":1')
      );
    });

    it("should allow requests within limit", async () => {
      const now = Date.now();
      vi.setSystemTime(now);

      mockGet.mockResolvedValueOnce(JSON.stringify({
        count: 3,
        windowStartedAt: now - 1000,
      }));
      mockSet.mockResolvedValueOnce(undefined);

      const result = await enforceSimpleRateLimit(DEFAULT_OPTIONS);

      expect(result.limited).toBe(false);
      expect(mockSet).toHaveBeenCalledWith(
        "rl:user123",
        expect.stringContaining('"count":4')
      );
    });

    it("should block requests exceeding limit", async () => {
      const now = Date.now();
      vi.setSystemTime(now);

      mockGet.mockResolvedValueOnce(JSON.stringify({
        count: 5,
        windowStartedAt: now - 1000,
      }));

      const result = await enforceSimpleRateLimit(DEFAULT_OPTIONS);

      expect(result.limited).toBe(true);
      expect(result.retryAfterSeconds).toBeGreaterThan(0);
      expect(mockSet).not.toHaveBeenCalled();
    });

    it("should calculate correct retry-after seconds", async () => {
      const now = Date.now();
      vi.setSystemTime(now);

      mockGet.mockResolvedValueOnce(JSON.stringify({
        count: 5,
        windowStartedAt: now - 30000, // 30 seconds ago
      }));

      const result = await enforceSimpleRateLimit({
        ...DEFAULT_OPTIONS,
        windowMs: 60000, // 60 second window
      });

      expect(result.limited).toBe(true);
      expect(result.retryAfterSeconds).toBe(30); // 60 - 30 = 30 seconds remaining
    });

    it("should reset counter after window expires", async () => {
      const now = Date.now();
      vi.setSystemTime(now);

      mockGet.mockResolvedValueOnce(JSON.stringify({
        count: 5,
        windowStartedAt: now - 61000, // 61 seconds ago
      }));
      mockSet.mockResolvedValueOnce(undefined);

      const result = await enforceSimpleRateLimit({
        ...DEFAULT_OPTIONS,
        windowMs: 60000,
      });

      expect(result.limited).toBe(false);
      expect(mockSet).toHaveBeenCalledWith(
        "rl:user123",
        expect.stringContaining('"count":1')
      );
    });

    it("should handle malformed blob data by resetting", async () => {
      mockGet.mockResolvedValueOnce("invalid json");
      mockSet.mockResolvedValueOnce(undefined);

      const result = await enforceSimpleRateLimit(DEFAULT_OPTIONS);

      expect(result.limited).toBe(false);
      expect(mockSet).toHaveBeenCalledWith(
        "rl:user123",
        expect.stringContaining('"count":1')
      );
    });

    it("should handle missing blob by creating new entry", async () => {
      mockGet.mockResolvedValueOnce(null);
      mockSet.mockResolvedValueOnce(undefined);

      const result = await enforceSimpleRateLimit(DEFAULT_OPTIONS);

      expect(result.limited).toBe(false);
      expect(mockSet).toHaveBeenCalled();
    });

    it("should handle blob store errors gracefully", async () => {
      mockGet.mockRejectedValueOnce(new Error("Store error"));
      mockSet.mockResolvedValueOnce(undefined);

      const result = await enforceSimpleRateLimit(DEFAULT_OPTIONS);

      expect(result.limited).toBe(false);
      expect(mockSet).toHaveBeenCalled();
    });

    it("should URL-encode subject in key", async () => {
      mockGet.mockResolvedValueOnce(null);
      mockSet.mockResolvedValueOnce(undefined);

      await enforceSimpleRateLimit({
        ...DEFAULT_OPTIONS,
        subject: "user@example.com",
      });

      expect(mockGet).toHaveBeenCalledWith("rl:user%40example.com");
    });

    it("should use 'unknown' for empty subject", async () => {
      mockGet.mockResolvedValueOnce(null);
      mockSet.mockResolvedValueOnce(undefined);

      await enforceSimpleRateLimit({
        ...DEFAULT_OPTIONS,
        subject: "",
      });

      expect(mockGet).toHaveBeenCalledWith("rl:unknown");
    });

    it("should handle custom prefix", async () => {
      mockGet.mockResolvedValueOnce(null);
      mockSet.mockResolvedValueOnce(undefined);

      await enforceSimpleRateLimit({
        ...DEFAULT_OPTIONS,
        prefix: "custom:",
      });

      expect(mockGet).toHaveBeenCalledWith("custom:user123");
    });

    it("should handle custom store name", async () => {
      mockGet.mockResolvedValueOnce(null);
      mockSet.mockResolvedValueOnce(undefined);

      await enforceSimpleRateLimit({
        ...DEFAULT_OPTIONS,
        storeName: "custom-store",
      });

      // getStore should have been called with custom-store
      expect(mockSet).toHaveBeenCalled();
    });

    it("should return minimum retry-after of 1 second", async () => {
      const now = Date.now();
      vi.setSystemTime(now);

      mockGet.mockResolvedValueOnce(JSON.stringify({
        count: 5,
        windowStartedAt: now - 59900, // 100ms remaining
      }));

      const result = await enforceSimpleRateLimit({
        ...DEFAULT_OPTIONS,
        windowMs: 60000,
      });

      expect(result.limited).toBe(true);
      expect(result.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    });

    it("should handle non-finite count by resetting", async () => {
      mockGet.mockResolvedValueOnce(JSON.stringify({
        count: Infinity,
        windowStartedAt: Date.now(),
      }));
      mockSet.mockResolvedValueOnce(undefined);

      const result = await enforceSimpleRateLimit(DEFAULT_OPTIONS);

      expect(result.limited).toBe(false);
    });

    it("should handle non-finite windowStartedAt by resetting", async () => {
      mockGet.mockResolvedValueOnce(JSON.stringify({
        count: 1,
        windowStartedAt: NaN,
      }));
      mockSet.mockResolvedValueOnce(undefined);

      const result = await enforceSimpleRateLimit(DEFAULT_OPTIONS);

      expect(result.limited).toBe(false);
    });

    it("should allow exactly maxRequests requests", async () => {
      const now = Date.now();
      vi.setSystemTime(now);

      mockGet.mockResolvedValueOnce(JSON.stringify({
        count: 4,
        windowStartedAt: now - 1000,
      }));
      mockSet.mockResolvedValueOnce(undefined);

      const result = await enforceSimpleRateLimit({
        ...DEFAULT_OPTIONS,
        maxRequests: 5,
      });

      expect(result.limited).toBe(false);
    });

    it("should block on maxRequests + 1", async () => {
      const now = Date.now();
      vi.setSystemTime(now);

      mockGet.mockResolvedValueOnce(JSON.stringify({
        count: 5,
        windowStartedAt: now - 1000,
      }));

      const result = await enforceSimpleRateLimit({
        ...DEFAULT_OPTIONS,
        maxRequests: 5,
      });

      expect(result.limited).toBe(true);
    });
  });
});
