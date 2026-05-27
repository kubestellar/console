import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  TEST_CORS_ORIGIN,
  makeNetlifyRequest,
} from "./netlify-handler-helpers";
import handler, { _testOnly } from "../affiliate-clicks.mts";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

// ── Mock @netlify/blobs ─────────────────────────────────────────────────
const mockGet = vi.fn();
const mockSet = vi.fn();

vi.mock("@netlify/blobs", () => ({
  getStore: () => ({ get: mockGet, set: mockSet }),
}));

// ── Mock Cryptography & Environment ──────────────────────────────────────
const mockImportKey = vi.fn().mockResolvedValue("fake-key");
const mockSign = vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]));

const fakeServiceAccount = {
  client_email: "test@example.com",
  private_key: "-----BEGIN PRIVATE KEY-----\nYWJjZA==\n-----END PRIVATE KEY-----",
};

const serviceAccountB64 = Buffer.from(JSON.stringify(fakeServiceAccount)).toString("base64");

// ── Helpers ─────────────────────────────────────────────────────────────
const mockFetch = vi.fn();

function makeEvent(searchParams?: string, extra?: { method?: string; origin?: string }) {
  return makeNetlifyRequest("/api/affiliate/clicks", {
    method: extra?.method ?? "GET",
    search: searchParams,
    origin: extra?.origin ?? TEST_CORS_ORIGIN,
  });
}

describe("affiliate-clicks Netlify Function", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockReset();
    mockSet.mockReset();
    mockFetch.mockReset();

    mockGet.mockResolvedValue(null);
    mockSet.mockResolvedValue(undefined);

    _testOnly.resetCache();

    vi.stubGlobal("fetch", mockFetch);
    vi.stubGlobal("crypto", {
      subtle: {
        importKey: mockImportKey,
        sign: mockSign,
      },
    });

    process.env.GA4_SERVICE_ACCOUNT_JSON = serviceAccountB64;
    process.env.GA4_PROPERTY_ID = "properties/12345";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.GA4_SERVICE_ACCOUNT_JSON;
    delete process.env.GA4_PROPERTY_ID;
  });

  describe("CORS Scenario Tests", () => {
    it("returns 200 with CORS headers on OPTIONS preflight request", async () => {
      const req = makeEvent(undefined, { method: "OPTIONS" });
      const res = await handler(req);
      expect([200, 204]).toContain(res.status);
      expect(res.headers.get("access-control-allow-origin")).toBe(TEST_CORS_ORIGIN);
    });

    it("includes Access-Control-Allow-Origin header in all responses", async () => {
      mockGet.mockResolvedValue(JSON.stringify({ data: {}, fetchedAt: Date.now() }));
      const req = makeEvent();
      const res = await handler(req);
      expect(res.headers.get("access-control-allow-origin")).toBe(TEST_CORS_ORIGIN);
    });
  });

  describe("Input Validation Scenario Tests", () => {
    it("returns 400 when required affiliate param is missing", async () => {
      // Trigger validation by passing other parameter fields (enforces custom query validation branch)
      const req = makeEvent("startDate=2026-01-01");
      const res = await handler(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("Missing required affiliate parameter");
    });

    it("returns 400 when date range params are invalid", async () => {
      const req1 = makeEvent("affiliate=rishi-jat&startDate=invalid-date");
      const res1 = await handler(req1);
      expect(res1.status).toBe(400);
      const body1 = await res1.json();
      expect(body1.error).toBe("Invalid startDate parameter");

      const req2 = makeEvent("affiliate=rishi-jat&endDate=invalid-date");
      const res2 = await handler(req2);
      expect(res2.status).toBe(400);
      const body2 = await res2.json();
      expect(body2.error).toBe("Invalid endDate parameter");
    });
  });

  describe("Cache Hit Scenario Tests", () => {
    it("returns cached click data from KV store without calling GA4 API", async () => {
      const cachedData = {
        "rishi-jat": { clicks: 10, unique_users: 3, utm_term: "intern-01" },
      };
      mockGet.mockResolvedValue(JSON.stringify({ data: cachedData, fetchedAt: Date.now() }));

      const req = makeEvent();
      const res = await handler(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual(cachedData);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("sets correct cache TTL headers in response", async () => {
      mockGet.mockResolvedValue(JSON.stringify({ data: {}, fetchedAt: Date.now() }));
      const req = makeEvent();
      const res = await handler(req);
      expect(res.headers.get("cache-control")).toBe("public, max-age=900");
    });
  });

  describe("Cache Miss → GA4 Query Scenario Tests", () => {
    it("calls GA4 API with correct property ID and date range on cache miss", async () => {
      mockGet.mockResolvedValue(null);
      mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "token123" }), { status: 200 }));
      mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ rows: [] }), { status: 200 }));
      mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ rows: [] }), { status: 200 }));

      const req = makeEvent();
      await handler(req);

      const ga4Call = mockFetch.mock.calls.find((call) =>
        call[0].includes("properties/properties/12345:runReport")
      );
      expect(ga4Call).toBeDefined();
    });

    it("writes GA4 response to KV cache after successful query", async () => {
      mockGet.mockResolvedValue(null);
      mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "token123" }), { status: 200 }));
      mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ rows: [] }), { status: 200 }));
      mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ rows: [] }), { status: 200 }));

      const req = makeEvent();
      await handler(req);

      await new Promise((r) => setTimeout(r, 10));
      expect(mockSet).toHaveBeenCalled();
      const [key, val] = mockSet.mock.calls[0];
      expect(key).toBe("clicks:all:default:default");
      const entry = JSON.parse(val);
      expect(entry.data).toBeDefined();
      expect(entry.fetchedAt).toBeLessThanOrEqual(Date.now());
    });

    it("applies intern-to-login name mapping to GA4 result", async () => {
      mockGet.mockResolvedValue(null);
      mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "token123" }), { status: 200 }));
      mockFetch.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            rows: [
              {
                dimensionValues: [{ value: "intern-01" }],
                metricValues: [{ value: "50" }, { value: "10" }],
              },
            ],
          }),
          { status: 200 }
        )
      );
      mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ rows: [] }), { status: 200 }));

      const req = makeEvent();
      const res = await handler(req);
      const body = await res.json();
      expect(body["rishi-jat"]).toEqual({ clicks: 50, unique_users: 10, utm_term: "intern-01" });
    });
  });

  describe("Click Capping Scenario Tests", () => {
    it("caps daily click count at the configured maximum", async () => {
      process.env.MAX_DAILY_CLICKS = "10";
      mockGet.mockResolvedValue(null);
      mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "token123" }), { status: 200 }));
      mockFetch.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            rows: [
              {
                dimensionValues: [{ value: "intern-01" }],
                metricValues: [{ value: "50" }, { value: "10" }],
              },
            ],
          }),
          { status: 200 }
        )
      );
      mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ rows: [] }), { status: 200 }));

      const req = makeEvent();
      const res = await handler(req);
      const body = await res.json();
      expect(body["rishi-jat"].clicks).toBe(10);
      delete process.env.MAX_DAILY_CLICKS;
    });

    it("does not cap counts below the maximum", async () => {
      process.env.MAX_DAILY_CLICKS = "100";
      mockGet.mockResolvedValue(null);
      mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "token123" }), { status: 200 }));
      mockFetch.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            rows: [
              {
                dimensionValues: [{ value: "intern-01" }],
                metricValues: [{ value: "50" }, { value: "10" }],
              },
            ],
          }),
          { status: 200 }
        )
      );
      mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ rows: [] }), { status: 200 }));

      const req = makeEvent();
      const res = await handler(req);
      const body = await res.json();
      expect(body["rishi-jat"].clicks).toBe(50);
      delete process.env.MAX_DAILY_CLICKS;
    });
  });

  describe("JWT Signing Scenario Tests", () => {
    it("includes Authorization header with signed JWT when calling GA4", async () => {
      mockGet.mockResolvedValue(null);
      mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "signed-oauth-token-xyz" }), { status: 200 }));
      mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ rows: [] }), { status: 200 }));
      mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ rows: [] }), { status: 200 }));

      const req = makeEvent();
      await handler(req);

      const reportCall = mockFetch.mock.calls.find((call) => call[0].includes("runReport"));
      expect(reportCall).toBeDefined();
      expect(reportCall[1].headers.Authorization).toBe("Bearer signed-oauth-token-xyz");
    });

    it("JWT payload contains correct iss, scope, iat, exp fields", async () => {
      mockGet.mockResolvedValue(null);
      mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "token" }), { status: 200 }));
      mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ rows: [] }), { status: 200 }));
      mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ rows: [] }), { status: 200 }));

      const req = makeEvent();
      await handler(req);

      const tokenCall = mockFetch.mock.calls.find((call) => call[0] === GOOGLE_TOKEN_URL);
      expect(tokenCall).toBeDefined();
      const bodyParams = new URLSearchParams(tokenCall[1].body);
      const assertion = bodyParams.get("assertion");
      expect(assertion).toBeDefined();

      const segments = assertion!.split(".");
      expect(segments).toHaveLength(3);
      const payload = JSON.parse(atob(segments[1].replace(/-/g, "+").replace(/_/g, "/")));
      expect(payload.iss).toBe("test@example.com");
      expect(payload.scope).toBe("https://www.googleapis.com/auth/analytics.readonly");
      expect(payload.iat).toBeLessThanOrEqual(Math.floor(Date.now() / 1000));
      expect(payload.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
    });
  });

  describe("Demo Fallback Scenario Tests", () => {
    it("returns demo data when DEMO_MODE env var is set", async () => {
      process.env.DEMO_MODE = "true";
      const req = makeEvent();
      const res = await handler(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body["rishi-jat"]).toBeDefined();
      expect(body["ghanshyam2005singh"]).toBeDefined();
      delete process.env.DEMO_MODE;
    });

    it("demo data contains non-null affiliate click array", async () => {
      process.env.DEMO_MODE = "true";
      const req = makeEvent();
      const res = await handler(req);
      const body = await res.json();
      expect(body["rishi-jat"].clicks).not.toBeNull();
      delete process.env.DEMO_MODE;
    });
  });

  describe("Error Handling Scenario Tests", () => {
    it("returns 500 with error message when GA4 API throws", async () => {
      mockGet.mockResolvedValue(null);
      mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "token" }), { status: 200 }));
      mockFetch.mockRejectedValueOnce(new Error("GA4 offline"));

      const req = makeEvent();
      const res = await handler(req);
      expect([500, 502]).toContain(res.status);
      const body = await res.json();
      expect(body.error).toBeDefined();
    });

    it("returns cached stale data when GA4 API throws and stale cache exists", async () => {
      const staleData = {
        "rishi-jat": { clicks: 5, unique_users: 2, utm_term: "intern-01" },
      };
      const expiredEntry = { data: staleData, fetchedAt: Date.now() - 10 * 60 * 1000 };
      mockGet.mockResolvedValue(JSON.stringify(expiredEntry));
      mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "token" }), { status: 200 }));
      mockFetch.mockRejectedValueOnce(new Error("GA4 offline"));

      const req = makeEvent();
      const res = await handler(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual(staleData);
    });
  });
});
