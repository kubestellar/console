// @vitest-environment node
/**
 * Unit tests for the shared identity-demo-request module.
 *
 * This module wraps static identity demo payloads with CORS, method checks,
 * and cluster query parameter validation. Tests verify correct responses
 * for preflight, allowed/disallowed methods, and parameter sanitization.
 */
import { describe, expect, it } from "vitest";

import { wrapIdentityDemoResponse } from "../_shared/identity-demo-request";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(method: string, url = "https://example.com/api"): Request {
  return new Request(url, { method });
}

async function parseJson(res: Response): Promise<unknown> {
  return res.json();
}

// ── Preflight ────────────────────────────────────────────────────────────────

describe("wrapIdentityDemoResponse — preflight", () => {
  it("returns 204 for OPTIONS request", async () => {
    const req = makeRequest("OPTIONS");
    const res = await wrapIdentityDemoResponse(req, { test: true });
    expect(res.status).toBe(204);
  });

  it("includes CORS headers for OPTIONS", async () => {
    const req = new Request("https://console.kubestellar.io/api", {
      method: "OPTIONS",
      headers: { Origin: "https://console.kubestellar.io" },
    });
    const res = await wrapIdentityDemoResponse(req, {});
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("GET");
  });
});

// ── Method validation ────────────────────────────────────────────────────────

describe("wrapIdentityDemoResponse — method validation", () => {
  it("returns 200 for GET requests", async () => {
    const req = makeRequest("GET");
    const res = await wrapIdentityDemoResponse(req, { identity: "demo" });
    expect(res.status).toBe(200);
  });

  it("returns the provided body as JSON for GET", async () => {
    const body = { clusters: ["a", "b"], total: 2 };
    const req = makeRequest("GET");
    const res = await wrapIdentityDemoResponse(req, body);
    const data = await parseJson(res);
    expect(data).toEqual(body);
  });

  it("returns 405 for POST", async () => {
    const req = makeRequest("POST");
    const res = await wrapIdentityDemoResponse(req, {});
    expect(res.status).toBe(405);
    const data = (await parseJson(res)) as { error: string };
    expect(data.error).toContain("Method not allowed");
  });

  it("returns 405 for PUT", async () => {
    const req = makeRequest("PUT");
    const res = await wrapIdentityDemoResponse(req, {});
    expect(res.status).toBe(405);
  });

  it("returns 405 for DELETE", async () => {
    const req = makeRequest("DELETE");
    const res = await wrapIdentityDemoResponse(req, {});
    expect(res.status).toBe(405);
  });

  it("includes Allow header for 405 responses", async () => {
    const req = makeRequest("POST");
    const res = await wrapIdentityDemoResponse(req, {});
    expect(res.headers.get("Allow")).toContain("GET");
  });
});

// ── Cluster parameter validation ─────────────────────────────────────────────

describe("wrapIdentityDemoResponse — cluster param", () => {
  it("accepts valid cluster names", async () => {
    const req = makeRequest("GET", "https://example.com/api?cluster=my-cluster");
    const res = await wrapIdentityDemoResponse(req, { ok: true });
    expect(res.status).toBe(200);
  });

  it("accepts cluster with dots and underscores", async () => {
    const req = makeRequest("GET", "https://example.com/api?cluster=k8s.cluster_v2");
    const res = await wrapIdentityDemoResponse(req, { ok: true });
    expect(res.status).toBe(200);
  });

  it("accepts numeric cluster names", async () => {
    const req = makeRequest("GET", "https://example.com/api?cluster=123");
    const res = await wrapIdentityDemoResponse(req, { ok: true });
    expect(res.status).toBe(200);
  });

  it("rejects cluster with path traversal characters", async () => {
    const req = makeRequest("GET", "https://example.com/api?cluster=../etc/passwd");
    const res = await wrapIdentityDemoResponse(req, { ok: true });
    expect(res.status).toBe(400);
    const data = (await parseJson(res)) as { error: string };
    expect(data.error).toContain("Invalid cluster");
  });

  it("rejects cluster with spaces", async () => {
    const req = makeRequest("GET", "https://example.com/api?cluster=my%20cluster");
    const res = await wrapIdentityDemoResponse(req, { ok: true });
    expect(res.status).toBe(400);
  });

  it("rejects cluster starting with dot", async () => {
    const req = makeRequest("GET", "https://example.com/api?cluster=.hidden");
    const res = await wrapIdentityDemoResponse(req, { ok: true });
    expect(res.status).toBe(400);
  });

  it("rejects cluster starting with hyphen", async () => {
    const req = makeRequest("GET", "https://example.com/api?cluster=-invalid");
    const res = await wrapIdentityDemoResponse(req, { ok: true });
    expect(res.status).toBe(400);
  });

  it("allows absent cluster parameter", async () => {
    const req = makeRequest("GET", "https://example.com/api");
    const res = await wrapIdentityDemoResponse(req, { ok: true });
    expect(res.status).toBe(200);
  });

  it("allows empty cluster parameter", async () => {
    const req = makeRequest("GET", "https://example.com/api?cluster=");
    const res = await wrapIdentityDemoResponse(req, { ok: true });
    expect(res.status).toBe(200);
  });
});

// ── Response format ──────────────────────────────────────────────────────────

describe("wrapIdentityDemoResponse — response format", () => {
  it("sets Content-Type to application/json", async () => {
    const req = makeRequest("GET");
    const res = await wrapIdentityDemoResponse(req, { x: 1 });
    expect(res.headers.get("Content-Type")).toBe("application/json");
  });

  it("serializes arrays", async () => {
    const req = makeRequest("GET");
    const res = await wrapIdentityDemoResponse(req, [1, 2, 3]);
    const data = await parseJson(res);
    expect(data).toEqual([1, 2, 3]);
  });

  it("serializes nested objects", async () => {
    const payload = { a: { b: { c: "deep" } } };
    const req = makeRequest("GET");
    const res = await wrapIdentityDemoResponse(req, payload);
    const data = await parseJson(res);
    expect(data).toEqual(payload);
  });
});
