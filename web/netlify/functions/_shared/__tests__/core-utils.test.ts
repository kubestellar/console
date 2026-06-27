import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockStoreDelete, mockStoreList, mockStoreSet } = vi.hoisted(() => ({
  mockStoreDelete: vi.fn(),
  mockStoreList: vi.fn(),
  mockStoreSet: vi.fn(),
}));

vi.mock("@netlify/blobs", () => ({
  getStore: vi.fn(() => ({ delete: mockStoreDelete, list: mockStoreList, set: mockStoreSet })),
}));

import * as barrel from "../index";
import {
  badRequestResponse,
  errorResponse,
  notFoundResponse,
  rateLimitResponse,
  serverErrorResponse,
  unauthorizedResponse,
} from "../errorResponse";
import { fetchWithRetry } from "../fetchWithRetry";
import { fetchWithTimeout } from "../fetchWithTimeout";
import {
  LEADERBOARD_CACHE_KEY,
  LEADERBOARD_CACHE_TTL_MS,
  LEADERBOARD_URL,
} from "../github-rewards.constants";
import { checkInMemoryRateLimit, getClientIp } from "../inMemoryRateLimit";
import { enforceSimpleRateLimit } from "../rate-limit";
import {
  MAX_RESPONSE_BYTES,
  isResponseTooLargeError,
  readCappedBuffer,
  readCappedJson,
  readCappedText,
} from "../read-capped-json";
import { buildCorsHeaders, handlePreflight, isAllowedOrigin } from "../cors";

const TEST_URL = "https://example.test/api/shared";
const ALLOWED_ORIGIN = "http://localhost:5174";
const BLOCKED_ORIGIN = "https://evil.example";
const ONE_SECOND_MS = 1_000;
const TEN_SECONDS_MS = 10_000;
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 2;
const RATE_LIMIT_PREFIX = "rl:";
const SHARED_HEADERS = "Content-Type, Authorization";
const EXPOSE_HEADERS = "X-Test-Header";
const METHOD_LIST = "GET, OPTIONS";
const RATE_LIMIT_WINDOW_MS = 30_000;
const FIXED_NOW_MS = Date.parse("2026-01-01T00:00:00.000Z");
const RATE_LIMIT_BUCKET = Math.floor(FIXED_NOW_MS / RATE_LIMIT_WINDOW_MS);
const LARGE_CONTENT_LENGTH = "6";
const SMALL_BUFFER_LIMIT = 3;
const OVERSIZED_LABEL = "artifact";

describe("shared core utilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("allows known origins and omits CORS headers for blocked origins", () => {
    expect(isAllowedOrigin(ALLOWED_ORIGIN)).toBe(true);
    expect(isAllowedOrigin("https://console.kubestellar.io")).toBe(true);
    expect(isAllowedOrigin("https://deploy-preview-42--kubestellar-console.netlify.app")).toBe(true);
    expect(isAllowedOrigin("https://feature-branch--kubestellar-docs.netlify.app")).toBe(true);
    expect(isAllowedOrigin(BLOCKED_ORIGIN)).toBe(false);

    const allowedRequest = new Request(TEST_URL, { headers: { Origin: ALLOWED_ORIGIN } });
    const allowedHeaders = buildCorsHeaders(allowedRequest, {
      methods: METHOD_LIST,
      headers: SHARED_HEADERS,
      exposeHeaders: EXPOSE_HEADERS,
    });
    expect(allowedHeaders).toMatchObject({
      "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
      "Access-Control-Allow-Methods": METHOD_LIST,
      "Access-Control-Allow-Headers": SHARED_HEADERS,
      "Access-Control-Expose-Headers": EXPOSE_HEADERS,
      "X-Content-Type-Options": "nosniff",
      Vary: "Origin",
    });

    const blockedRequest = new Request(TEST_URL, { headers: { Origin: BLOCKED_ORIGIN } });
    expect(buildCorsHeaders(blockedRequest, { methods: METHOD_LIST })).toEqual({
      "X-Content-Type-Options": "nosniff",
      Vary: "Origin",
    });

    expect(handlePreflight(allowedRequest, { methods: METHOD_LIST }).status).toBe(204);
    expect(handlePreflight(blockedRequest, { methods: METHOD_LIST }).status).toBe(403);
  });

  it("formats JSON error responses with helper-specific statuses", async () => {
    const custom = errorResponse("broken", {
      status: 418,
      headers: { "X-Test": "yes" },
    });
    expect(custom.status).toBe(418);
    expect(custom.headers.get("content-type")).toBe("application/json");
    expect(custom.headers.get("x-test")).toBe("yes");
    await expect(custom.json()).resolves.toEqual({ error: "broken" });

    await expect(rateLimitResponse(7).json()).resolves.toEqual({
      error: "Rate limit exceeded",
      retryAfter: 7,
    });
    expect(rateLimitResponse(7).headers.get("retry-after")).toBe("7");
    expect(badRequestResponse("bad").status).toBe(400);
    expect(unauthorizedResponse().status).toBe(401);
    expect(notFoundResponse("missing").status).toBe(404);
    expect(serverErrorResponse().status).toBe(500);
  });

  it("extracts client IP and enforces the in-memory rate limit window", () => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW_MS);

    const directIp = getClientIp(new Request(TEST_URL, {
      headers: { "x-nf-client-connection-ip": "10.0.0.1" },
    }));
    const forwardedIp = getClientIp(new Request(TEST_URL, {
      headers: { "x-forwarded-for": " 192.168.0.4 , 192.168.0.5 " },
    }));
    const unknownIp = getClientIp(new Request(TEST_URL));
    expect(directIp).toBe("10.0.0.1");
    expect(forwardedIp).toBe("untrusted-client");
    expect(unknownIp).toBe("untrusted-client");

    const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
    expect(checkInMemoryRateLimit("client-a", rateLimitMap, MAX_REQUESTS, TEN_SECONDS_MS)).toEqual({
      allowed: true,
      retryAfterSeconds: 0,
    });
    expect(checkInMemoryRateLimit("client-a", rateLimitMap, MAX_REQUESTS, TEN_SECONDS_MS)).toEqual({
      allowed: true,
      retryAfterSeconds: 0,
    });

    vi.setSystemTime(FIXED_NOW_MS + ONE_SECOND_MS);
    expect(checkInMemoryRateLimit("client-a", rateLimitMap, MAX_REQUESTS, TEN_SECONDS_MS)).toEqual({
      allowed: false,
      retryAfterSeconds: 9,
    });

    vi.setSystemTime(FIXED_NOW_MS + TEN_SECONDS_MS + 1);
    expect(checkInMemoryRateLimit("client-a", rateLimitMap, MAX_REQUESTS, TEN_SECONDS_MS)).toEqual({
      allowed: true,
      retryAfterSeconds: 0,
    });
  });

  it("prunes expired tracked subjects once the map reaches capacity", () => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW_MS);

    const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
    for (let index = 0; index < 1_000; index += 1) {
      rateLimitMap.set(`expired-${index}`, { count: 1, resetAt: FIXED_NOW_MS - ONE_SECOND_MS });
    }

    checkInMemoryRateLimit("fresh-client", rateLimitMap, 3, WINDOW_MS);

    expect(rateLimitMap.has("expired-0")).toBe(false);
    expect(rateLimitMap.get("fresh-client")).toEqual({
      count: 1,
      resetAt: FIXED_NOW_MS + WINDOW_MS,
    });
  });

  it("persists append-only blob-backed rate limits and returns retry-after when limited", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW_MS);
    vi.spyOn(crypto, "randomUUID").mockReturnValue("uuid-1");

    mockStoreSet.mockResolvedValue(undefined);
    mockStoreList.mockImplementation(({ paginate, prefix }: { paginate?: boolean; prefix: string }) => {
      if (paginate) {
        return {
          async *[Symbol.asyncIterator]() {
            yield { blobs: [{ key: `${prefix}1767225600000:uuid-1` }] };
          },
        } satisfies AsyncIterable<{ blobs: Array<{ key: string }> }>;
      }

      return Promise.resolve({ blobs: [] });
    });

    const initial = await enforceSimpleRateLimit({
      storeName: "shared-rate-limit",
      prefix: RATE_LIMIT_PREFIX,
      subject: "user@example.com",
      maxRequests: 3,
      windowMs: RATE_LIMIT_WINDOW_MS,
    });
    expect(initial).toEqual({ limited: false, retryAfterSeconds: 0 });
    expect(mockStoreSet).toHaveBeenCalledWith(
      `rl:user%40example.com:${RATE_LIMIT_BUCKET}:${FIXED_NOW_MS}:uuid-1`,
      String(FIXED_NOW_MS),
    );

    mockStoreList.mockImplementation(({ paginate, prefix }: { paginate?: boolean; prefix: string }) => {
      if (paginate) {
        return {
          async *[Symbol.asyncIterator]() {
            yield {
              blobs: [
                { key: `${prefix}1767225600000:uuid-1` },
                { key: `${prefix}1767225600001:uuid-2` },
                { key: `${prefix}1767225600002:uuid-3` },
                { key: `${prefix}1767225600003:uuid-4` },
              ],
            };
          },
        } satisfies AsyncIterable<{ blobs: Array<{ key: string }> }>;
      }

      return Promise.resolve({ blobs: [] });
    });

    vi.setSystemTime(FIXED_NOW_MS + ONE_SECOND_MS);
    const limited = await enforceSimpleRateLimit({
      storeName: "shared-rate-limit",
      prefix: RATE_LIMIT_PREFIX,
      subject: "user@example.com",
      maxRequests: 3,
      windowMs: RATE_LIMIT_WINDOW_MS,
    });
    expect(limited.limited).toBe(true);
    expect(limited.retryAfterSeconds).toBe(29);
  });

  it("fails closed when append-only blob-backed rate limit operations error", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW_MS);
    vi.spyOn(crypto, "randomUUID").mockReturnValue("uuid-1");

    mockStoreSet.mockRejectedValueOnce(new Error("store failure"));

    const result = await enforceSimpleRateLimit({
      storeName: "shared-rate-limit",
      prefix: RATE_LIMIT_PREFIX,
      subject: "",
      maxRequests: 3,
      windowMs: RATE_LIMIT_WINDOW_MS,
    });

    expect(result.limited).toBe(true);
    expect(result.retryAfterSeconds).toBe(60);
  });

  it("passes AbortSignal timeouts through fetchWithTimeout", async () => {
    const signal = { aborted: false } as AbortSignal;
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout").mockReturnValue(signal);
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await fetchWithTimeout(TEST_URL, {
      method: "POST",
      headers: { Accept: "application/json" },
      timeoutMs: TEN_SECONDS_MS,
    });

    expect(response.status).toBe(200);
    expect(timeoutSpy).toHaveBeenCalledWith(TEN_SECONDS_MS);
    expect(fetchMock).toHaveBeenCalledWith(TEST_URL, {
      method: "POST",
      headers: { Accept: "application/json" },
      signal,
    });
  });

  it("retries transient fetch failures with exponential backoff", async () => {
    vi.useFakeTimers();
    const signal = { aborted: false } as AbortSignal;
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(signal);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("server error", { status: 503 }))
      .mockResolvedValueOnce(new Response("done", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const promise = fetchWithRetry(TEST_URL, {
      maxRetries: MAX_REQUESTS,
      initialDelayMs: 50,
      timeoutMs: TEN_SECONDS_MS,
    });

    await vi.runAllTimersAsync();
    const response = await promise;

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenLastCalledWith(TEST_URL, {
      signal,
    });
  });

  it("returns 4xx responses without retrying and rethrows final network errors", async () => {
    vi.useFakeTimers();

    const clientErrorFetch = vi.fn().mockResolvedValue(new Response("missing", { status: 404 }));
    vi.stubGlobal("fetch", clientErrorFetch);
    const clientError = await fetchWithRetry(TEST_URL, { maxRetries: MAX_REQUESTS });
    expect(clientError.status).toBe(404);
    expect(clientErrorFetch).toHaveBeenCalledTimes(1);

    const networkError = new Error("network down");
    const failingFetch = vi.fn().mockRejectedValue(networkError);
    vi.stubGlobal("fetch", failingFetch);

    const promise = fetchWithRetry(TEST_URL, {
      maxRetries: 1,
      initialDelayMs: 25,
    });
    await vi.runAllTimersAsync();
    await expect(promise).rejects.toThrow("network down");
    expect(failingFetch).toHaveBeenCalledTimes(2);
  });

  it("reads capped buffers, text, and JSON while rejecting oversized responses", async () => {
    const jsonResponse = new Response(JSON.stringify({ ok: true }), {
      headers: { "content-length": "12" },
    });
    await expect(readCappedJson<{ ok: boolean }>(jsonResponse, "json")).resolves.toEqual({ ok: true });

    const textResponse = new Response("hello");
    await expect(readCappedText(textResponse, 5, "text")).resolves.toBe("hello");

    const emptyResponse = new Response(null);
    await expect(readCappedBuffer(emptyResponse, 1, "empty")).resolves.toEqual(new Uint8Array(0));

    const oversizedHeader = new Response("123456", {
      headers: { "content-length": LARGE_CONTENT_LENGTH },
    });
    await expect(readCappedBuffer(oversizedHeader, 5, OVERSIZED_LABEL)).rejects.toThrow(
      `${OVERSIZED_LABEL} response too large (content-length: 6)`,
    );

    const oversizedBody = new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2]));
        controller.enqueue(new Uint8Array([3, 4]));
        controller.close();
      },
    }));
    await expect(readCappedBuffer(oversizedBody, SMALL_BUFFER_LIMIT, OVERSIZED_LABEL)).rejects.toThrow(
      `${OVERSIZED_LABEL} response too large (body: 4 bytes)`,
    );

    expect(isResponseTooLargeError(new Error("artifact response too large (body: 4 bytes)"))).toBe(true);
    expect(isResponseTooLargeError(new Error("different problem"))).toBe(false);
    expect(MAX_RESPONSE_BYTES).toBe(512_000);
  });

  it("exports shared helpers through the barrel and keeps reward constants stable", () => {
    expect(barrel.buildCorsHeaders).toBe(buildCorsHeaders);
    expect(barrel.checkInMemoryRateLimit).toBe(checkInMemoryRateLimit);
    expect(barrel.fetchWithRetry).toBe(fetchWithRetry);
    expect(LEADERBOARD_URL).toBe("https://kubestellar.io/data/leaderboard.json");
    expect(LEADERBOARD_CACHE_KEY).toBe("__leaderboard__");
    expect(LEADERBOARD_CACHE_TTL_MS).toBe(3_600_000);
  });
});
