import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ServiceAccountKey } from "../analytics-dashboard-types";
import { getAccessToken } from "../analytics-dashboard-auth";

const FIXED_NOW_MS = Date.parse("2026-02-03T04:05:06.000Z");
const TOKEN_CACHE_KEY = "access-token";
const REFRESHABLE_TOKEN = "cached-token";
const FRESH_TOKEN = "fresh-token";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const TEST_PRIVATE_KEY = "-----BEGIN PRIVATE KEY-----\nAQID\n-----END PRIVATE KEY-----\n";

const SERVICE_ACCOUNT: ServiceAccountKey = {
  client_email: "analytics@test.iam.gserviceaccount.com",
  private_key: TEST_PRIVATE_KEY,
  project_id: "test-project",
};

describe("analytics-dashboard-auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW_MS);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("returns a cached token when it is still outside the refresh buffer", async () => {
    const store = {
      get: vi.fn().mockResolvedValue(JSON.stringify({
        accessToken: REFRESHABLE_TOKEN,
        expiresAt: FIXED_NOW_MS + 10 * 60 * 1_000,
      })),
      set: vi.fn().mockResolvedValue(undefined),
    };
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const token = await getAccessToken(SERVICE_ACCOUNT, store as never);

    expect(token).toBe(REFRESHABLE_TOKEN);
    expect(store.get).toHaveBeenCalledWith(TOKEN_CACHE_KEY, { type: "text" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(store.set).not.toHaveBeenCalled();
  });

  it("mints, exchanges, and caches a fresh token on cache miss", async () => {
    const store = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
    };
    const importKey = vi.fn().mockResolvedValue("mock-key");
    const sign = vi.fn().mockResolvedValue(new Uint8Array([7, 8, 9]).buffer);
    vi.stubGlobal("crypto", {
      subtle: { importKey, sign },
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      access_token: FRESH_TOKEN,
      expires_in: 1_800,
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const token = await getAccessToken(SERVICE_ACCOUNT, store as never);

    expect(token).toBe(FRESH_TOKEN);
    expect(importKey).toHaveBeenCalledOnce();
    expect(sign).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(GOOGLE_TOKEN_URL, expect.objectContaining({
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: expect.any(URLSearchParams),
      signal: expect.any(AbortSignal),
    }));

    const body = fetchMock.mock.calls[0]?.[1]?.body;
    expect(body).toBeInstanceOf(URLSearchParams);
    expect((body as URLSearchParams).get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:jwt-bearer");
    expect((body as URLSearchParams).get("assertion")).toContain(".");

    expect(store.set).toHaveBeenCalledWith(
      TOKEN_CACHE_KEY,
      JSON.stringify({
        accessToken: FRESH_TOKEN,
        expiresAt: FIXED_NOW_MS + 1_800 * 1_000,
      }),
    );
  });

  it("sanitizes token exchange failures before throwing a generic error", async () => {
    const store = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
    };
    vi.stubGlobal("crypto", {
      subtle: {
        importKey: vi.fn().mockResolvedValue("mock-key"),
        sign: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]).buffer),
      },
    });
    const upstreamBody = `${"failure line\n".repeat(80)}end`;
    const fetchMock = vi.fn().mockResolvedValue(new Response(upstreamBody, { status: 502 }));
    vi.stubGlobal("fetch", fetchMock);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(getAccessToken(SERVICE_ACCOUNT, store as never)).rejects.toThrow(/Upstream service error \(req=\d+\)/);

    expect(errorSpy).toHaveBeenCalledOnce();
    const loggedMessage = String(errorSpy.mock.calls[0]?.[0] ?? "");
    expect(loggedMessage).toContain("token exchange failed");
    expect(loggedMessage).not.toContain("\n");
    expect(loggedMessage).toContain("…[truncated]");
  });
});
