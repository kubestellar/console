/**
 * Unit tests for rate-limit.ts (#16109).
 * Tests blob-based rate limiting with append-only window tokens.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enforceSimpleRateLimit, type SimpleRateLimitOptions } from "../rate-limit";

const { mockDelete, mockList, mockSet } = vi.hoisted(() => ({
  mockDelete: vi.fn(),
  mockList: vi.fn(),
  mockSet: vi.fn(),
}));

vi.mock("@netlify/blobs", () => ({
  getStore: vi.fn(() => ({
    delete: mockDelete,
    list: mockList,
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
const FIXED_NOW_MS = Date.parse("2026-01-01T00:00:00.000Z");
const DEFAULT_WINDOW_BUCKET = Math.floor(FIXED_NOW_MS / DEFAULT_OPTIONS.windowMs);
const CLEANUP_NOW_MS = Date.parse("2026-01-01T00:02:10.000Z");
const CLEANUP_BUCKET = Math.floor(CLEANUP_NOW_MS / DEFAULT_OPTIONS.windowMs) - 2;

function createPaginator(blobs: Array<{ key: string }>): AsyncIterable<{ blobs: Array<{ key: string }> }> {
  return {
    async *[Symbol.asyncIterator]() {
      yield { blobs };
    },
  };
}

describe("rate-limit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW_MS);
    vi.spyOn(crypto, "randomUUID").mockReturnValue("uuid-1");

    mockDelete.mockResolvedValue(undefined);
    mockSet.mockResolvedValue(undefined);
    mockList.mockImplementation(({ paginate, prefix }: { paginate?: boolean; prefix: string }) => {
      if (paginate) {
        return createPaginator([{ key: `${prefix}1767225600000:uuid-1` }]);
      }
      return Promise.resolve({ blobs: [] });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe("enforceSimpleRateLimit", () => {
    it("allows first request and creates a unique token entry", async () => {
      const result = await enforceSimpleRateLimit(DEFAULT_OPTIONS);

      expect(result).toEqual({ limited: false, retryAfterSeconds: 0 });
      expect(mockSet).toHaveBeenCalledWith(
        `rl:user123:${DEFAULT_WINDOW_BUCKET}:${FIXED_NOW_MS}:uuid-1`,
        String(FIXED_NOW_MS),
      );
    });

    it("allows requests within limit", async () => {
      mockList.mockImplementation(({ paginate, prefix }: { paginate?: boolean; prefix: string }) => {
        if (paginate) {
          return createPaginator([
            { key: `${prefix}1767225600000:uuid-1` },
            { key: `${prefix}1767225600001:uuid-2` },
            { key: `${prefix}1767225600002:uuid-3` },
            { key: `${prefix}1767225600003:uuid-4` },
          ]);
        }
        return Promise.resolve({ blobs: [] });
      });

      const result = await enforceSimpleRateLimit(DEFAULT_OPTIONS);

      expect(result).toEqual({ limited: false, retryAfterSeconds: 0 });
    });

    it("blocks requests exceeding limit after counting concurrent tokens", async () => {
      mockList.mockImplementation(({ paginate, prefix }: { paginate?: boolean; prefix: string }) => {
        if (paginate) {
          return createPaginator([
            { key: `${prefix}1767225600000:uuid-1` },
            { key: `${prefix}1767225600001:uuid-2` },
            { key: `${prefix}1767225600002:uuid-3` },
            { key: `${prefix}1767225600003:uuid-4` },
            { key: `${prefix}1767225600004:uuid-5` },
            { key: `${prefix}1767225600005:uuid-6` },
          ]);
        }
        return Promise.resolve({ blobs: [] });
      });

      const result = await enforceSimpleRateLimit(DEFAULT_OPTIONS);

      expect(result.limited).toBe(true);
      expect(result.retryAfterSeconds).toBe(60);
    });

    it("URL-encodes the subject in token keys", async () => {
      await enforceSimpleRateLimit({
        ...DEFAULT_OPTIONS,
        subject: "user@example.com",
      });

      expect(mockSet).toHaveBeenCalledWith(
        `rl:user%40example.com:${DEFAULT_WINDOW_BUCKET}:${FIXED_NOW_MS}:uuid-1`,
        String(FIXED_NOW_MS),
      );
    });

    it("uses unknown for empty subjects", async () => {
      await enforceSimpleRateLimit({
        ...DEFAULT_OPTIONS,
        subject: "",
      });

      expect(mockSet).toHaveBeenCalledWith(
        `rl:unknown:${DEFAULT_WINDOW_BUCKET}:${FIXED_NOW_MS}:uuid-1`,
        String(FIXED_NOW_MS),
      );
    });

    it("cleans up an expired bucket before counting the current window", async () => {
      vi.setSystemTime(CLEANUP_NOW_MS);

      mockList.mockImplementation(({ paginate, prefix }: { paginate?: boolean; prefix: string }) => {
        if (paginate) {
          return createPaginator([{ key: `${prefix}1767225730000:uuid-1` }]);
        }

        if (prefix === `rl:user123:${CLEANUP_BUCKET}:`) {
          return Promise.resolve({
            blobs: [
              { key: `rl:user123:${CLEANUP_BUCKET}:1767225600000:uuid-a` },
              { key: `rl:user123:${CLEANUP_BUCKET}:1767225600001:uuid-b` },
            ],
          });
        }

        return Promise.resolve({ blobs: [] });
      });

      await enforceSimpleRateLimit(DEFAULT_OPTIONS);

      expect(mockDelete).toHaveBeenCalledWith(`rl:user123:${CLEANUP_BUCKET}:1767225600000:uuid-a`);
      expect(mockDelete).toHaveBeenCalledWith(`rl:user123:${CLEANUP_BUCKET}:1767225600001:uuid-b`);
    });

    it("counts paginated blob results across pages", async () => {
      mockList.mockImplementation(({ paginate, prefix }: { paginate?: boolean; prefix: string }) => {
        if (paginate) {
          return {
            async *[Symbol.asyncIterator]() {
              yield { blobs: [{ key: `${prefix}1:a` }, { key: `${prefix}2:b` }] };
              yield { blobs: [{ key: `${prefix}3:c` }, { key: `${prefix}4:d` }] };
            },
          } satisfies AsyncIterable<{ blobs: Array<{ key: string }> }>;
        }
        return Promise.resolve({ blobs: [] });
      });

      const result = await enforceSimpleRateLimit({
        ...DEFAULT_OPTIONS,
        maxRequests: 4,
      });

      expect(result.limited).toBe(false);
      expect(result.retryAfterSeconds).toBe(0);
    });

    it("fails closed when blob operations error", async () => {
      mockSet.mockRejectedValueOnce(new Error("store error"));

      const result = await enforceSimpleRateLimit(DEFAULT_OPTIONS);

      expect(result).toEqual({ limited: true, retryAfterSeconds: 60 });
    });
  });
});
