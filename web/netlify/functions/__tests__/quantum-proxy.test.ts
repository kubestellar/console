/**
 * Vitest unit tests for quantum-proxy.mts Netlify function (#15626, Part of #4189).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Context } from "@netlify/functions";
import {
  TEST_CORS_ORIGIN,
  makeNetlifyRequest,
  readJson,
} from "./netlify-handler-helpers";

// Named constants for HTTP status codes to avoid magic numbers
const HTTP_STATUS_OK = 200;
const HTTP_STATUS_CREATED = 201;
const HTTP_STATUS_BAD_REQUEST = 400;
const HTTP_STATUS_UNAUTHORIZED = 401;
const HTTP_STATUS_METHOD_NOT_ALLOWED = 405;
const HTTP_STATUS_REQUEST_TOO_LARGE = 413;
const HTTP_STATUS_RATE_LIMITED = 429;
const HTTP_STATUS_BAD_GATEWAY = 502;
const HTTP_STATUS_SERVICE_UNAVAILABLE = 503;
const HTTP_STATUS_INTERNAL_SERVER_ERROR = 500;

// Match the internal limit defined in quantum-proxy.mts (1MB)
const MAX_PROXY_BODY_BYTES = 1_048_576;

// Hoisted mock functions for rate limit
const { mockEnforceSimpleRateLimit } = vi.hoisted(() => ({
  mockEnforceSimpleRateLimit: vi.fn(),
}));

vi.mock("../_shared/rate-limit", () => ({
  enforceSimpleRateLimit: mockEnforceSimpleRateLimit,
}));

import handler from "../quantum-proxy.mts";

describe("quantum-proxy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnforceSimpleRateLimit.mockResolvedValue({ limited: false, retryAfterSeconds: 0 });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("HTTP Method validation", () => {
    it("returns 405 for non-GET/POST methods", async () => {
      const req = makeNetlifyRequest("/.netlify/functions/quantum-proxy/status", {
        method: "PUT",
      });
      const res = await handler(req, { env: {} } as unknown as Context);
      expect(res.status).toBe(HTTP_STATUS_METHOD_NOT_ALLOWED);
      const body = await readJson<{ error: string }>(res);
      expect(body.error).toBe("Method not allowed");
      expect(res.headers.get("Allow")).toBe("GET, POST");
    });
  });

  describe("Path Allowlist validation", () => {
    it("returns 400 when path is not in allowlist", async () => {
      const req = makeNetlifyRequest("/.netlify/functions/quantum-proxy/invalid-path");
      const res = await handler(req, { env: {} } as unknown as Context);
      expect(res.status).toBe(HTTP_STATUS_BAD_REQUEST);
      const body = await readJson<{ error: string }>(res);
      expect(body.error).toBe("Invalid proxy path");
    });

    it("returns 400 when path contains invalid characters or sequences", async () => {
      const req = makeNetlifyRequest("/.netlify/functions/quantum-proxy/status//status");
      const res = await handler(req, { env: {} } as unknown as Context);
      expect(res.status).toBe(HTTP_STATUS_BAD_REQUEST);
      const body = await readJson<{ error: string }>(res);
      expect(body.error).toBe("Invalid proxy path");
    });

    it("returns 400 when scheme/absolute URL injection is attempted", async () => {
      const req = makeNetlifyRequest("/.netlify/functions/quantum-proxy/http://malicious");
      const res = await handler(req, { env: {} } as unknown as Context);
      expect(res.status).toBe(HTTP_STATUS_BAD_REQUEST);
      const body = await readJson<{ error: string }>(res);
      expect(body.error).toBe("Invalid proxy path");
    });
  });

  describe("Authorization & Rate Limiting for POST mutations", () => {
    it("returns 401 for POST when authorization and cookies are missing", async () => {
      const req = makeNetlifyRequest("/.netlify/functions/quantum-proxy/execute", {
        method: "POST",
      });
      const res = await handler(req, { env: {} } as unknown as Context);
      expect(res.status).toBe(HTTP_STATUS_UNAUTHORIZED);
      const body = await readJson<{ error: string }>(res);
      expect(body.error).toBe("Unauthorized");
    });

    it("accepts Bearer Authorization token for POST request", async () => {
      // In demo mode, it won't crash when QUANTUM_SERVICE_URL is absent
      const req = new Request("https://example.test/.netlify/functions/quantum-proxy/execute", {
        method: "POST",
        headers: {
          Origin: TEST_CORS_ORIGIN,
          authorization: "Bearer valid-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ circuit: "OPENQASM 2.0;" }),
      });
      const res = await handler(req, { env: {} } as unknown as Context);
      expect(res.status).toBe(HTTP_STATUS_OK);
    });

    it("accepts kc_auth Cookie for POST request", async () => {
      const req = new Request("https://example.test/.netlify/functions/quantum-proxy/execute", {
        method: "POST",
        headers: {
          Origin: TEST_CORS_ORIGIN,
          cookie: "kc_auth=active-session",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ circuit: "OPENQASM 2.0;" }),
      });
      const res = await handler(req, { env: {} } as unknown as Context);
      expect(res.status).toBe(HTTP_STATUS_OK);
    });

    it("returns 429 when simple rate limit is exceeded on POST", async () => {
      mockEnforceSimpleRateLimit.mockResolvedValue({ limited: true, retryAfterSeconds: 300 });
      const req = new Request("https://example.test/.netlify/functions/quantum-proxy/execute", {
        method: "POST",
        headers: {
          Origin: TEST_CORS_ORIGIN,
          authorization: "Bearer valid-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ circuit: "OPENQASM 2.0;" }),
      });
      const res = await handler(req, { env: {} } as unknown as Context);
      expect(res.status).toBe(HTTP_STATUS_RATE_LIMITED);
      const body = await readJson<{ error: string; retryAfter: number }>(res);
      expect(body.error).toBe("Rate limit exceeded");
      expect(body.retryAfter).toBe(300);
    });
  });

  describe("Fallback / Demo Mode (QUANTUM_SERVICE_URL is absent)", () => {
    it("returns status demo response", async () => {
      const req = makeNetlifyRequest("/.netlify/functions/quantum-proxy/status");
      const res = await handler(req, { env: {} } as unknown as Context);
      expect(res.status).toBe(HTTP_STATUS_OK);
      expect(res.headers.get("Content-Type")).toBe("application/json");
      const body = await readJson<{ status: string; backend: string }>(res);
      expect(body.status).toBe("ready");
      expect(body.backend).toBe("Aer Simulator");
    });

    it("returns qubits demo response", async () => {
      const req = makeNetlifyRequest("/.netlify/functions/quantum-proxy/qubits/simple");
      const res = await handler(req, { env: {} } as unknown as Context);
      expect(res.status).toBe(HTTP_STATUS_OK);
      const body = await readJson<{ qubits: number[] }>(res);
      expect(body.qubits).toEqual([0, 1, 2, 3, 4]);
    });

    it("returns execute demo response", async () => {
      const req = new Request("https://example.test/.netlify/functions/quantum-proxy/execute", {
        method: "POST",
        headers: {
          Origin: TEST_CORS_ORIGIN,
          authorization: "Bearer token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ circuit: "OPENQASM 2.0;" }),
      });
      const res = await handler(req, { env: {} } as unknown as Context);
      expect(res.status).toBe(HTTP_STATUS_OK);
      const body = await readJson<{ job_id: string; status: string }>(res);
      expect(body.job_id).toBe("demo-job-123");
      expect(body.status).toBe("completed");
    });

    it("returns loop start demo response", async () => {
      const req = new Request("https://example.test/.netlify/functions/quantum-proxy/loop/start", {
        method: "POST",
        headers: {
          Origin: TEST_CORS_ORIGIN,
          authorization: "Bearer token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ circuit: "OPENQASM 2.0;" }),
      });
      const res = await handler(req, { env: {} } as unknown as Context);
      expect(res.status).toBe(HTTP_STATUS_OK);
      const body = await readJson<{ status: string; loop_id: string }>(res);
      expect(body.status).toBe("started");
      expect(body.loop_id).toBe("demo-loop-456");
    });

    it("returns loop stop demo response", async () => {
      const req = new Request("https://example.test/.netlify/functions/quantum-proxy/loop/stop", {
        method: "POST",
        headers: {
          Origin: TEST_CORS_ORIGIN,
          authorization: "Bearer token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });
      const res = await handler(req, { env: {} } as unknown as Context);
      expect(res.status).toBe(HTTP_STATUS_OK);
      const body = await readJson<{ status: string }>(res);
      expect(body.status).toBe("stopped");
    });

    it("returns ASCII HTML circuit demo response", async () => {
      const req = makeNetlifyRequest("/.netlify/functions/quantum-proxy/qasm/circuit/ascii");
      const res = await handler(req, { env: {} } as unknown as Context);
      expect(res.status).toBe(HTTP_STATUS_OK);
      expect(res.headers.get("Content-Type")).toBe("text/html");
      const text = await res.text();
      expect(text).toContain("Circuit Diagram");
      expect(text).toContain("q_0");
      expect(text).toContain("H");
    });

    it("returns auth status demo response", async () => {
      const req = makeNetlifyRequest("/.netlify/functions/quantum-proxy/auth/status");
      const res = await handler(req, { env: {} } as unknown as Context);
      expect(res.status).toBe(HTTP_STATUS_OK);
      const body = await readJson<{ authenticated: boolean }>(res);
      expect(body.authenticated).toBe(false);
    });

    it("returns listfiles demo response", async () => {
      const req = makeNetlifyRequest("/.netlify/functions/quantum-proxy/qasm/listfiles");
      const res = await handler(req, { env: {} } as unknown as Context);
      expect(res.status).toBe(HTTP_STATUS_OK);
      const body = await readJson<{ files: string[] }>(res);
      expect(body.files).toEqual(["bell.qasm"]);
    });
  });

  describe("Proxy Mode (QUANTUM_SERVICE_URL configured)", () => {
    const mockServiceUrl = "https://quantum-backend.kubestellar.io";
    const contextWithEnv = {
      env: { QUANTUM_SERVICE_URL: mockServiceUrl },
    } as unknown as Context;

    it("proxies GET request successfully to upstream and filters headers", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ status: "alive" }), {
          status: HTTP_STATUS_OK,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "public, max-age=3600",
            "X-Sensitive-Upstream-Header": "secret-value",
          },
        })
      );
      vi.stubGlobal("fetch", fetchMock);

      const req = makeNetlifyRequest("/.netlify/functions/quantum-proxy/status", {
        headers: { Accept: "application/json" },
      });
      const res = await handler(req, contextWithEnv);

      expect(res.status).toBe(HTTP_STATUS_OK);
      const body = await readJson<{ status: string }>(res);
      expect(body.status).toBe("alive");

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const firstCallUrl = fetchMock.mock.calls[0][0];
      const firstCallInit = fetchMock.mock.calls[0][1] as RequestInit;
      expect(firstCallUrl).toBe(`${mockServiceUrl}/status`);
      expect(firstCallInit.method).toBe("GET");

      const forwardedHeaders = new Headers(firstCallInit.headers);
      expect(forwardedHeaders.get("accept")).toBe("application/json");

      // Assert safe headers are forwarded and sensitive headers are discarded
      expect(res.headers.get("Content-Type")).toBe("application/json");
      expect(res.headers.get("Cache-Control")).toBe("public, max-age=3600");
      expect(res.headers.get("X-Sensitive-Upstream-Header")).toBeNull();
    });

    it("returns 413 when request body content-length exceeds MAX_PROXY_BODY_BYTES", async () => {
      const hugeBodyLength = MAX_PROXY_BODY_BYTES + 1;
      const req = makeNetlifyRequest("/.netlify/functions/quantum-proxy/execute", {
        method: "POST",
        headers: {
          authorization: "Bearer valid-token",
          "content-length": String(hugeBodyLength),
        },
      });
      const res = await handler(req, contextWithEnv);
      expect(res.status).toBe(HTTP_STATUS_REQUEST_TOO_LARGE);
      const body = await readJson<{ error: string }>(res);
      expect(body.error).toBe("Request body too large");
    });

    it("returns 400 when POST request body has invalid JSON", async () => {
      const req = new Request("https://example.test/.netlify/functions/quantum-proxy/execute", {
        method: "POST",
        headers: {
          Origin: TEST_CORS_ORIGIN,
          authorization: "Bearer token",
          "Content-Type": "application/json",
        },
        body: "invalid-json-body-string{",
      });
      const res = await handler(req, contextWithEnv);
      expect(res.status).toBe(HTTP_STATUS_BAD_REQUEST);
      const body = await readJson<{ error: string }>(res);
      expect(body.error).toBe("Invalid JSON in request body");
    });

    it("returns 400 when POST request body is not an object", async () => {
      const req = new Request("https://example.test/.netlify/functions/quantum-proxy/execute", {
        method: "POST",
        headers: {
          Origin: TEST_CORS_ORIGIN,
          authorization: "Bearer token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(["not-an-object"]),
      });
      const res = await handler(req, contextWithEnv);
      expect(res.status).toBe(HTTP_STATUS_BAD_REQUEST);
      const body = await readJson<{ error: string }>(res);
      expect(body.error).toBe("Request body must be a JSON object");
    });

    it("returns 400 when POST request body is missing 'circuit' for /execute", async () => {
      const req = new Request("https://example.test/.netlify/functions/quantum-proxy/execute", {
        method: "POST",
        headers: {
          Origin: TEST_CORS_ORIGIN,
          authorization: "Bearer token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ otherKey: "val" }),
      });
      const res = await handler(req, contextWithEnv);
      expect(res.status).toBe(HTTP_STATUS_BAD_REQUEST);
      const body = await readJson<{ error: string }>(res);
      expect(body.error).toBe('Request body must be an object with a non-empty "circuit" string');
    });

    it("returns 400 when POST request body for /loop/stop is not empty", async () => {
      const req = new Request("https://example.test/.netlify/functions/quantum-proxy/loop/stop", {
        method: "POST",
        headers: {
          Origin: TEST_CORS_ORIGIN,
          authorization: "Bearer token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ loop_id: "demo" }),
      });
      const res = await handler(req, contextWithEnv);
      expect(res.status).toBe(HTTP_STATUS_BAD_REQUEST);
      const body = await readJson<{ error: string }>(res);
      expect(body.error).toBe("Request body for /loop/stop must be empty");
    });

    it("proxies POST request successfully to upstream when validation passes", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ job_id: "upstream-job-42" }), {
          status: HTTP_STATUS_CREATED,
          headers: { "Content-Type": "application/json" },
        })
      );
      vi.stubGlobal("fetch", fetchMock);

      const req = new Request("https://example.test/.netlify/functions/quantum-proxy/execute", {
        method: "POST",
        headers: {
          Origin: TEST_CORS_ORIGIN,
          authorization: "Bearer token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ circuit: "OPENQASM 2.0; qreg q[1];" }),
      });
      const res = await handler(req, contextWithEnv);

      expect(res.status).toBe(HTTP_STATUS_CREATED);
      const body = await readJson<{ job_id: string }>(res);
      expect(body.job_id).toBe("upstream-job-42");

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const firstCallInit = fetchMock.mock.calls[0][1] as RequestInit;
      expect(firstCallInit.method).toBe("POST");
      const passedBody = JSON.parse(firstCallInit.body as string);
      expect(passedBody.circuit).toBe("OPENQASM 2.0; qreg q[1];");
    });

    it("returns 502 when upstream response content-length header exceeds MAX_RESPONSE_BYTES", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: "oversized" }), {
          status: HTTP_STATUS_OK,
          headers: {
            "Content-Type": "application/json",
            "Content-Length": "2000000",
          },
        })
      );
      vi.stubGlobal("fetch", fetchMock);

      const req = makeNetlifyRequest("/.netlify/functions/quantum-proxy/status");
      const res = await handler(req, contextWithEnv);
      expect(res.status).toBe(HTTP_STATUS_BAD_GATEWAY);
      const body = await readJson<{ error: string }>(res);
      expect(body.error).toBe("Upstream response too large");
    });

    it("returns 502 when actual stream payload size exceeds MAX_RESPONSE_BYTES", async () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(600_000));
          controller.enqueue(new Uint8Array(600_000));
          controller.close();
        },
      });

      const fetchMock = vi.fn().mockResolvedValue(
        new Response(stream, {
          status: HTTP_STATUS_OK,
          headers: { "Content-Type": "application/json" },
        })
      );
      vi.stubGlobal("fetch", fetchMock);

      const req = makeNetlifyRequest("/.netlify/functions/quantum-proxy/status");
      const res = await handler(req, contextWithEnv);
      expect(res.status).toBe(HTTP_STATUS_BAD_GATEWAY);
      const body = await readJson<{ error: string }>(res);
      expect(body.error).toBe("Upstream response too large");
    });

    it("forwards upstream 5xx error responses cleanly as-is without rewriting status code", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "Internal crash upstream" }), {
          status: HTTP_STATUS_INTERNAL_SERVER_ERROR,
          headers: { "Content-Type": "application/json" },
        })
      );
      vi.stubGlobal("fetch", fetchMock);

      const req = makeNetlifyRequest("/.netlify/functions/quantum-proxy/status");
      const res = await handler(req, contextWithEnv);
      expect(res.status).toBe(HTTP_STATUS_INTERNAL_SERVER_ERROR);
      const body = await readJson<{ error: string }>(res);
      expect(body.error).toBe("Internal crash upstream");
    });

    it("returns 503 when network-level fetch to upstream rejects", async () => {
      const fetchMock = vi.fn().mockRejectedValue(new Error("DNS resolution failed"));
      vi.stubGlobal("fetch", fetchMock);

      const req = makeNetlifyRequest("/.netlify/functions/quantum-proxy/status");
      const res = await handler(req, contextWithEnv);
      expect(res.status).toBe(HTTP_STATUS_SERVICE_UNAVAILABLE);
      const body = await readJson<{ error: string }>(res);
      expect(body.error).toBe("Quantum service unavailable");
    });
  });
});
