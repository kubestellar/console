/**
 * Unit tests for rate-limit.ts (#16109).
 * Tests blob-based rate limiting with window management.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enforceSimpleRateLimit, type SimpleRateLimitOptions } from "../rate-limit";

const mockGetWithMetadata = vi.fn();
const mockSet = vi.fn();

vi.mock("@netlify/blobs", () => ({
  getStore: vi.fn(() => ({
    getWithMetadata: mockGetWithMetadata,
    set: mockSet,
  })),
}));

const DEFAULT_OPTIONS: SimpleRateLimitOptions = {
  storeName: "test-store",
  prefix: "rl:",
  subject: "user123",
  maxRequests: 5,
  windowMs: 60_000,
};

const DEFAULT_ETAG = '"etag-1"';

function mockBlobRecord(record: { count: number; windowStartedAt: number }, etag = DEFAULT_ETAG): void {
  mockGetWithMetadata.mockResolvedValueOnce({
    data: JSON.stringify(record),
    etag,
    metadata: null,
  });
}

describe("rate-limit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("enforceSimpleRateLimit", () => {
    it("allows first request and creates a new entry atomically", async () => {
      mockGetWithMetadata.mockResolvedValueOnce(null);
      mockSet.mockResolvedValueOnce({ modified: true, etag: '"etag-new"' });

      const result = await enforceSimpleRateLimit(DEFAULT_OPTIONS);

      expect(result).toEqual({ limited: false, retryAfterSeconds: 0 });
      expect(mockGetWithMetadata).toHaveBeenCalledWith("rl:user123", {
        consistency: "strong",
        type: "text",
      });
      expect(mockSet).toHaveBeenCalledWith(
        "rl:user123",
        JSON.stringify({ count: 1, windowStartedAt: Date.now() }),
        { onlyIfNew: true },
      );
    });

    it("allows requests within limit with ETag-based compare-and-set", async () => {
      const now = Date.now();
      vi.setSystemTime(now);
      mockBlobRecord({
        count: 3,
        windowStartedAt: now - 1_000,
      });
      mockSet.mockResolvedValueOnce({ modified: true, etag: '"etag-2"' });

      const result = await enforceSimpleRateLimit(DEFAULT_OPTIONS);

      expect(result).toEqual({ limited: false, retryAfterSeconds: 0 });
      expect(mockSet).toHaveBeenCalledWith(
        "rl:user123",
        JSON.stringify({ count: 4, windowStartedAt: now - 1_000 }),
        { onlyIfMatch: DEFAULT_ETAG },
      );
    });

    it("blocks requests exceeding limit", async () => {
      const now = Date.now();
      vi.setSystemTime(now);
      mockBlobRecord({
        count: 5,
        windowStartedAt: now - 1_000,
      });

      const result = await enforceSimpleRateLimit(DEFAULT_OPTIONS);

      expect(result.limited).toBe(true);
      expect(result.retryAfterSeconds).toBeGreaterThan(0);
      expect(mockSet).not.toHaveBeenCalled();
    });

    it("calculates correct retry-after seconds", async () => {
      const now = Date.now();
      vi.setSystemTime(now);
      mockBlobRecord({
        count: 5,
        windowStartedAt: now - 30_000,
      });

      const result = await enforceSimpleRateLimit(DEFAULT_OPTIONS);

      expect(result).toEqual({ limited: true, retryAfterSeconds: 30 });
    });

    it("resets expired counters with conditional writes", async () => {
      const now = Date.now();
      vi.setSystemTime(now);
      mockBlobRecord({
        count: 5,
        windowStartedAt: now - 61_000,
      });
      mockSet.mockResolvedValueOnce({ modified: true, etag: '"etag-reset"' });

      const result = await enforceSimpleRateLimit(DEFAULT_OPTIONS);

      expect(result).toEqual({ limited: false, retryAfterSeconds: 0 });
      expect(mockSet).toHaveBeenCalledWith(
        "rl:user123",
        JSON.stringify({ count: 1, windowStartedAt: now }),
        { onlyIfMatch: DEFAULT_ETAG },
      );
    });

    it("resets malformed blob data using the last seen ETag", async () => {
      mockGetWithMetadata.mockResolvedValueOnce({
        data: "invalid json",
        etag: DEFAULT_ETAG,
        metadata: null,
      });
      mockSet.mockResolvedValueOnce({ modified: true, etag: '"etag-reset"' });

      const result = await enforceSimpleRateLimit(DEFAULT_OPTIONS);

      expect(result).toEqual({ limited: false, retryAfterSeconds: 0 });
      expect(mockSet).toHaveBeenCalledWith(
        "rl:user123",
        JSON.stringify({ count: 1, windowStartedAt: Date.now() }),
        { onlyIfMatch: DEFAULT_ETAG },
      );
    });

    it("fails closed when a create race loses only-if-new", async () => {
      mockGetWithMetadata.mockResolvedValueOnce(null);
      mockSet.mockResolvedValueOnce({ modified: false });

      const result = await enforceSimpleRateLimit(DEFAULT_OPTIONS);

      expect(result).toEqual({ limited: true, retryAfterSeconds: 1 });
    });

    it("fails closed when an update race loses only-if-match", async () => {
      const now = Date.now();
      vi.setSystemTime(now);
      mockBlobRecord({
        count: 3,
        windowStartedAt: now - 1_000,
      });
      mockSet.mockResolvedValueOnce({ modified: false });

      const result = await enforceSimpleRateLimit(DEFAULT_OPTIONS);

      expect(result).toEqual({ limited: true, retryAfterSeconds: 59 });
    });

    it("treats conditional write conflict errors as rate-limited", async () => {
      const now = Date.now();
      vi.setSystemTime(now);
      mockBlobRecord({
        count: 3,
        windowStartedAt: now - 1_000,
      });
      mockSet.mockRejectedValueOnce({ status: 409 });

      const result = await enforceSimpleRateLimit(DEFAULT_OPTIONS);

      expect(result).toEqual({ limited: true, retryAfterSeconds: 59 });
    });

    it("falls back to only-if-new after blob read errors", async () => {
      mockGetWithMetadata.mockRejectedValueOnce(new Error("Store error"));
      mockSet.mockResolvedValueOnce({ modified: true, etag: '"etag-new"' });

      const result = await enforceSimpleRateLimit(DEFAULT_OPTIONS);

      expect(result).toEqual({ limited: false, retryAfterSeconds: 0 });
      expect(mockSet).toHaveBeenCalledWith(
        "rl:user123",
        JSON.stringify({ count: 1, windowStartedAt: Date.now() }),
        { onlyIfNew: true },
      );
    });

    it("URL-encodes subject in key", async () => {
      mockGetWithMetadata.mockResolvedValueOnce(null);
      mockSet.mockResolvedValueOnce({ modified: true, etag: '"etag-new"' });

      await enforceSimpleRateLimit({
        ...DEFAULT_OPTIONS,
        subject: "user@example.com",
      });

      expect(mockGetWithMetadata).toHaveBeenCalledWith("rl:user%40example.com", {
        consistency: "strong",
        type: "text",
      });
    });

    it("uses unknown for empty subject", async () => {
      mockGetWithMetadata.mockResolvedValueOnce(null);
      mockSet.mockResolvedValueOnce({ modified: true, etag: '"etag-new"' });

      await enforceSimpleRateLimit({
        ...DEFAULT_OPTIONS,
        subject: "",
      });

      expect(mockGetWithMetadata).toHaveBeenCalledWith("rl:unknown", {
        consistency: "strong",
        type: "text",
      });
    });

    it("handles custom prefix", async () => {
      mockGetWithMetadata.mockResolvedValueOnce(null);
      mockSet.mockResolvedValueOnce({ modified: true, etag: '"etag-new"' });

      await enforceSimpleRateLimit({
        ...DEFAULT_OPTIONS,
        prefix: "custom:",
      });

      expect(mockGetWithMetadata).toHaveBeenCalledWith("custom:user123", {
        consistency: "strong",
        type: "text",
      });
    });

    it("returns minimum retry-after of one second", async () => {
      const now = Date.now();
      vi.setSystemTime(now);
      mockBlobRecord({
        count: 5,
        windowStartedAt: now - 59_900,
      });

      const result = await enforceSimpleRateLimit(DEFAULT_OPTIONS);

      expect(result.limited).toBe(true);
      expect(result.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    });

    it("resets non-finite count values", async () => {
      const now = Date.now();
      vi.setSystemTime(now);
      mockBlobRecord({
        count: Number.POSITIVE_INFINITY,
        windowStartedAt: now,
      });
      mockSet.mockResolvedValueOnce({ modified: true, etag: '"etag-reset"' });

      const result = await enforceSimpleRateLimit(DEFAULT_OPTIONS);

      expect(result).toEqual({ limited: false, retryAfterSeconds: 0 });
      expect(mockSet).toHaveBeenCalledWith(
        "rl:user123",
        JSON.stringify({ count: 1, windowStartedAt: now }),
        { onlyIfMatch: DEFAULT_ETAG },
      );
    });

    it("resets non-finite window start values", async () => {
      const now = Date.now();
      vi.setSystemTime(now);
      mockGetWithMetadata.mockResolvedValueOnce({
        data: JSON.stringify({ count: 1, windowStartedAt: Number.NaN }),
        etag: DEFAULT_ETAG,
        metadata: null,
      });
      mockSet.mockResolvedValueOnce({ modified: true, etag: '"etag-reset"' });

      const result = await enforceSimpleRateLimit(DEFAULT_OPTIONS);

      expect(result).toEqual({ limited: false, retryAfterSeconds: 0 });
      expect(mockSet).toHaveBeenCalledWith(
        "rl:user123",
        JSON.stringify({ count: 1, windowStartedAt: now }),
        { onlyIfMatch: DEFAULT_ETAG },
      );
    });

    it("allows exactly maxRequests requests", async () => {
      const now = Date.now();
      vi.setSystemTime(now);
      mockBlobRecord({
        count: 4,
        windowStartedAt: now - 1_000,
      });
      mockSet.mockResolvedValueOnce({ modified: true, etag: '"etag-2"' });

      const result = await enforceSimpleRateLimit(DEFAULT_OPTIONS);

      expect(result).toEqual({ limited: false, retryAfterSeconds: 0 });
    });

    it("blocks on maxRequests plus one", async () => {
      const now = Date.now();
      vi.setSystemTime(now);
      mockBlobRecord({
        count: 5,
        windowStartedAt: now - 1_000,
      });

      const result = await enforceSimpleRateLimit(DEFAULT_OPTIONS);

      expect(result.limited).toBe(true);
    });
  });
});
