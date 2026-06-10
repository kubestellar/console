/**
 * @vitest-environment node
 * Vitest unit tests for quantum-proxy.mts Netlify function (#15626, Part of #4189).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Context } from "@netlify/functions";
import { SignJWT } from "jose";
import {
  TEST_CORS_ORIGIN,
  makeNetlifyRequest,
  readJson,
} from "./netlify-handler-helpers";
import { ALLOWED_PATHS } from "../quantum-proxy.mts";

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
const TEST_JWT_SECRET = "test-quantum-proxy-secret";
const JWT_EXPIRATION_WINDOW_SECONDS = 60 * 60;
const JWT_NONE_HEADER = { alg: "none", typ: "JWT" };
const JWT_NONE_PAYLOAD = { sub: "quantum-proxy-test", exp: 4_102_444_800 };
const JWT_SIGNING_HEADER = { alg: "HS256", typ: "JWT" };

async function createSignedJwt(secret: string = TEST_JWT_SECRET): Promise<string> {
  const expiresInSeconds = JWT_EXPIRATION_WINDOW_SECONDS;
  return new SignJWT({ sub: "quantum-proxy-test" })
    .setProtectedHeader(JWT_SIGNING_HEADER)
    .setExpirationTime(`${expiresInSeconds}s`)
    .sign(new TextEncoder().encode(secret));
}

function createUnsignedJwt(): string {
  const header = Buffer.from(JSON.stringify(JWT_NONE_HEADER)).toString("base64url");
  const payload = Buffer.from(JSON.stringify(JWT_NONE_PAYLOAD)).toString("base64url");
  return `${header}.${payload}.`;
}

function makeContext(env: Record<string, string> = {}): Context {
  return { env } as unknown as Context;
}

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
      const res = await handler(req, makeContext());
      expect(res.status).toBe(HTTP_STATUS_METHOD_NOT_ALLOWED);
      const body = await readJson<{ error: string }>(res);
      expect(body.error).toBe("Method not allowed");
      expect(res.headers.get("Allow")).toBe("GET, POST");
    });
  });

  describe("Path Allowlist validation", () => {
    it("returns 400 when path is not in allowlist", async () => {
      const req = makeNetlifyRequest("/.netlify/functions/quantum-proxy/invalid-path");
      const res = await handler(req, makeContext());
      expect(res.status).toBe(HTTP_STATUS_BAD_REQUEST);
      const body = await readJson<{ error: string }>(res);
      expect(body.error).toBe("Invalid proxy path");
    });

    it("returns 400 when path contains invalid characters or sequences", async () => {
      const req = makeNetlifyRequest("/.netlify/functions/quantum-proxy/status//status");
      const res = await handler(req, makeContext());
      expect(res.status).toBe(HTTP_STATUS_BAD_REQUEST);
      const body = await readJson<{ error: string }>(res);
      expect(body.error).toBe("Invalid proxy path");
    });

    it("returns 400 when scheme/absolute URL injection is attempted", async () => {
      const req = makeNetlifyRequest("/.netlify/functions/quantum-proxy/http://malicious");
      const res = await handler(req, makeContext());
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
      const res = await handler(req, makeContext({ JWT_SECRET: TEST_JWT_SECRET }));
      expect(res.status).toBe(HTTP_STATUS_UNAUTHORIZED);
      const body = await readJson<{ error: string }>(res);
      expect(body.error).toBe("Unauthorized");
    });

    it("rejects invalid Bearer Authorization tokens", async () => {
      const req = new Request("https://example.test/.netlify/functions/quantum-proxy/execute", {
        method: "POST",
        headers: {
          Origin: TEST_CORS_ORIGIN,
          authorization: "Bearer invalid-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ circuit: "OPENQASM 2.0;" }),
      });
      const res = await handler(req, makeContext({ JWT_SECRET: TEST_JWT_SECRET }));
      expect(res.status).toBe(HTTP_STATUS_UNAUTHORIZED);
      const body = await readJson<{ error: string }>(res);
      expect(body.error).toBe("Unauthorized");
    });

    it("rejects alg:none JWT tokens", async () => {
      const unsignedToken = createUnsignedJwt();
      const req = new Request("https://example.test/.netlify/functions/quantum-proxy/execute", {
        method: "POST",
        headers: {
          Origin: TEST_CORS_ORIGIN,
          authorization: `Bearer ${unsignedToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ circuit: "OPENQASM 2.0;" }),
      });
      const res = await handler(req, makeContext({ JWT_SECRET: TEST_JWT_SECRET }));
      expect(res.status).toBe(HTTP_STATUS_UNAUTHORIZED);
      const body = await readJson<{ error: string }>(res);
      expect(body.error).toBe("Unauthorized");
    });

    it("accepts valid signed Bearer token for POST", async () => {
      const bearerToken = await createSignedJwt();
      const req = new Request("https://example.test/.netlify/functions/quantum-proxy/execute", {
        method: "POST",
        headers: {
          Origin: TEST_CORS_ORIGIN,
          authorization: `Bearer ${bearerToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ circuit: "OPENQASM 2.0;" }),
      });
      const res = await handler(req, makeContext({ JWT_SECRET: TEST_JWT_SECRET }));
      // No upstream configured, so 200 demo response
      expect(res.status).toBe(HTTP_STATUS_OK);
    });

    it("accepts valid JWT in session cookie for POST (OAuth flow)", async () => {
      const cookieToken = await createSignedJwt();
      const req = new Request("https://example.test/.netlify/functions/quantum-proxy/execute", {
        method: "POST",
        headers: {
          Origin: TEST_CORS_ORIGIN,
          cookie: `kc_auth=${cookieToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ circuit: "OPENQASM 2.0;" }),
      });
      const res = await handler(req, makeContext({ JWT_SECRET: TEST_JWT_SECRET }));
      expect(res.status).toBe(HTTP_STATUS_OK);
    });

    it("returns 401 when JWT secret mismatch (wrong secret)", async () => {
      const bearerToken = await createSignedJwt("different-secret");
      const req = new Request("https://example.test/.netlify/functions/quantum-proxy/execute", {
        method: "POST",
        headers: {
          Origin: TEST_CORS_ORIGIN,
          authorization: `Bearer ${bearerToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ circuit: "OPENQASM 2.0;" }),
      });
      const res = await handler(req, makeContext({ JWT_SECRET: TEST_JWT_SECRET }));
      expect(res.status).toBe(HTTP_STATUS_UNAUTHORIZED);
    });

    it("returns 429 when rate limit is exceeded", async () => {
      const bearerToken = await createSignedJwt();
      mockEnforceSimpleRateLimit.mockResolvedValue({ limited: true, retryAfterSeconds: 60 });

      const req = new Request("https://example.test/.netlify/functions/quantum-proxy/execute", {
        method: "POST",
        headers: {
          Origin: TEST_CORS_ORIGIN,
          authorization: `Bearer ${bearerToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ circuit: "OPENQASM 2.0;" }),
      });
      const res = await handler(req, makeContext({ JWT_SECRET: TEST_JWT_SECRET }));
      expect(res.status).toBe(HTTP_STATUS_RATE_LIMITED);
      const body = await readJson<{ error: string; retryAfter: number }>(res);
      expect(body.error).toBe("Rate limit exceeded");
      expect(body.retryAfter).toBe(60);
    });

    it("returns 413 when POST body exceeds 1MB limit", async () => {
      const bearerToken = await createSignedJwt();
      const oversizedBody = "x".repeat(MAX_PROXY_BODY_BYTES + 1);
      const req = new Request("https://example.test/.netlify/functions/quantum-proxy/execute", {
        method: "POST",
        headers: {
          Origin: TEST_CORS_ORIGIN,
          authorization: `Bearer ${bearerToken}`,
          "Content-Type": "application/json",
        },
        body: oversizedBody,
      });
      const res = await handler(req, makeContext({ JWT_SECRET: TEST_JWT_SECRET }));
      expect(res.status).toBe(HTTP_STATUS_REQUEST_TOO_LARGE);
      const body = await readJson<{ error: string }>(res);
      expect(body.error).toBe("Request body too large");
    });

    it("returns 400 when POST body is not valid JSON", async () => {
      const bearerToken = await createSignedJwt();
      const req = new Request("https://example.test/.netlify/functions/quantum-proxy/execute", {
        method: "POST",
        headers: {
          Origin: TEST_CORS_ORIGIN,
          authorization: `Bearer ${bearerToken}`,
          "Content-Type": "application/json",
        },
        body: "not-json{{",
      });
      const res = await handler(req, makeContext({ JWT_SECRET: TEST_JWT_SECRET }));
      expect(res.status).toBe(HTTP_STATUS_BAD_REQUEST);
      const body = await readJson<{ error: string }>(res);
      expect(body.error).toBe("Invalid JSON in request body");
    });

    it("returns 400 when POST body is a JSON array (not an object)", async () => {
      const bearerToken = await createSignedJwt();
      const req = new Request("https://example.test/.netlify/functions/quantum-proxy/execute", {
        method: "POST",
        headers: {
          Origin: TEST_CORS_ORIGIN,
          authorization: `Bearer ${bearerToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify([{ circuit: "OPENQASM 2.0;" }]),
      });
      const res = await handler(req, makeContext({ JWT_SECRET: TEST_JWT_SECRET }));
      expect(res.status).toBe(HTTP_STATUS_BAD_REQUEST);
      const body = await readJson<{ error: string }>(res);
      expect(body.error).toBe("Request body must be a JSON object");
    });
  });

  describe("Demo mode (no QUANTUM_SERVICE_URL)", () => {
    it("returns demo status response for GET /status", async () => {
      const req = makeNetlifyRequest("/.netlify/functions/quantum-proxy/status");
      const res = await handler(req, makeContext());
      expect(res.status).toBe(HTTP_STATUS_OK);
      const body = await readJson<{ status: string; backend: string }>(res);
      expect(body.status).toBe("ready");
      expect(body.backend).toBe("Aer Simulator");
    });

    it("returns demo qubits/simple response", async () => {
      const req = makeNetlifyRequest("/.netlify/functions/quantum-proxy/qubits/simple");
      const res = await handler(req, makeContext());
      expect(res.status).toBe(HTTP_STATUS_OK);
      const body = await readJson<{ qubits: number[] }>(res);
      expect(body.qubits).toEqual([0, 1, 2, 3, 4]);
    });

    it("returns demo execute response for POST /execute with valid auth", async () => {
      const bearerToken = await createSignedJwt();
      const req = new Request("https://example.test/.netlify/functions/quantum-proxy/execute", {
        method: "POST",
        headers: {
          Origin: TEST_CORS_ORIGIN,
          authorization: `Bearer ${bearerToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ circuit: "OPENQASM 2.0;" }),
      });
      const res = await handler(req, makeContext({ JWT_SECRET: TEST_JWT_SECRET }));
      expect(res.status).toBe(HTTP_STATUS_OK);
      const body = await readJson<{ job_id: string; status: string }>(res);
      expect(body.job_id).toBe("demo-job-123");
    });

    it("returns demo loop/start response", async () => {
      const bearerToken = await createSignedJwt();
      const req = new Request("https://example.test/.netlify/functions/quantum-proxy/loop/start", {
        method: "POST",
        headers: {
          Origin: TEST_CORS_ORIGIN,
          authorization: `Bearer ${bearerToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ circuit: "OPENQASM 2.0;" }),
      });
      const res = await handler(req, makeContext({ JWT_SECRET: TEST_JWT_SECRET }));
      expect(res.status).toBe(HTTP_STATUS_OK);
      const body = await readJson<{ status: string }>(res);
      expect(body.status).toBe("started");
    });

    it("returns demo loop/stop response", async () => {
      const bearerToken = await createSignedJwt();
      const req = new Request("https://example.test/.netlify/functions/quantum-proxy/loop/stop", {
        method: "POST",
        headers: {
          Origin: TEST_CORS_ORIGIN,
          authorization: `Bearer ${bearerToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ circuit: "OPENQASM 2.0;" }),
      });
      const res = await handler(req, makeContext({ JWT_SECRET: TEST_JWT_SECRET }));
      expect(res.status).toBe(HTTP_STATUS_OK);
      const body = await readJson<{ status: string }>(res);
      expect(body.status).toBe("stopped");
    });

    it("returns demo qasm/circuit/ascii HTML response", async () => {
      const req = makeNetlifyRequest("/.netlify/functions/quantum-proxy/qasm/circuit/ascii");
      const res = await handler(req, makeContext());
      expect(res.status).toBe(HTTP_STATUS_OK);
      expect(res.headers.get("content-type")).toContain("text/html");
    });

    it("returns demo auth/status response", async () => {
      const req = makeNetlifyRequest("/.netlify/functions/quantum-proxy/auth/status");
      const res = await handler(req, makeContext());
      expect(res.status).toBe(HTTP_STATUS_OK);
      const body = await readJson<{ authenticated: boolean }>(res);
      expect(body.authenticated).toBe(false);
    });

    it("returns demo qasm/listfiles response", async () => {
      const req = makeNetlifyRequest("/.netlify/functions/quantum-proxy/qasm/listfiles");
      const res = await handler(req, makeContext());
      expect(res.status).toBe(HTTP_STATUS_OK);
      const body = await readJson<{ files: string[] }>(res);
      expect(body.files).toContain("bell.qasm");
    });

    it("returns 503 Quantum service not configured for non-demo paths with no QUANTUM_SERVICE_URL", async () => {
      const req = makeNetlifyRequest("/.netlify/functions/quantum-proxy/result/histogram");
      const res = await handler(req, makeContext());
      expect(res.status).toBe(HTTP_STATUS_SERVICE_UNAVAILABLE);
      const body = await readJson<{ error: string }>(res);
      expect(body.error).toBe("Quantum service not configured");
    });

    it("returns demo execute response with job_id, status, and result in demo mode", async () => {
      const bearerToken = await createSignedJwt();
      const req = new Request("https://example.test/.netlify/functions/quantum-proxy/execute", {
        method: "POST",
        headers: {
          Origin: TEST_CORS_ORIGIN,
          authorization: `Bearer ${bearerToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ circuit: "OPENQASM 2.0;" }),
      });
      const res = await handler(req, makeContext({ JWT_SECRET: TEST_JWT_SECRET }));
      expect(res.status).toBe(HTTP_STATUS_OK);
      const body = await readJson<{ job_id: string; status: string; result: { counts: Record<string, number> } }>(res);
      expect(body.job_id).toBe("demo-job-123");
      expect(body.status).toBe("completed");
      expect(body.result).toBeDefined();
      expect(typeof body.result.counts).toBe("object");
    });
  });

  describe("Proxy mode (QUANTUM_SERVICE_URL set)", () => {
    const contextWithEnv = makeContext({
      QUANTUM_SERVICE_URL: "https://quantum.example.com",
      JWT_SECRET: TEST_JWT_SECRET,
    });

    it("proxies GET /status to upstream and returns upstream response", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ status: "ready", backend: "real-backend" }), {
          status: HTTP_STATUS_OK,
          headers: { "Content-Type": "application/json" },
        })
      );
      vi.stubGlobal("fetch", fetchMock);

      const req = makeNetlifyRequest("/.netlify/functions/quantum-proxy/status");
      const res = await handler(req, contextWithEnv);
      expect(res.status).toBe(HTTP_STATUS_OK);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [calledURL] = fetchMock.mock.calls[0] as [string, ...unknown[]];
      expect(calledURL).toBe("https://quantum.example.com/api/status");
    });

    it("proxies POST /execute with bearer token to upstream", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ job_id: "real-job-1" }), {
          status: HTTP_STATUS_CREATED,
          headers: { "Content-Type": "application/json" },
        })
      );
      vi.stubGlobal("fetch", fetchMock);

      const bearerToken = await createSignedJwt();
      const req = new Request("https://example.test/.netlify/functions/quantum-proxy/execute", {
        method: "POST",
        headers: {
          Origin: TEST_CORS_ORIGIN,
          authorization: `Bearer ${bearerToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ circuit: "OPENQASM 2.0;" }),
      });
      const res = await handler(req, contextWithEnv);
      expect(res.status).toBe(HTTP_STATUS_CREATED);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("proxies POST /qasm/file with bearer token to upstream", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ file: "circuit.qasm" }), {
          status: HTTP_STATUS_OK,
          headers: { "Content-Type": "application/json" },
        })
      );
      vi.stubGlobal("fetch", fetchMock);

      const bearerToken = await createSignedJwt();
      const req = new Request("https://example.test/.netlify/functions/quantum-proxy/qasm/file", {
        method: "POST",
        headers: {
          Origin: TEST_CORS_ORIGIN,
          authorization: `Bearer ${bearerToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ circuit: "OPENQASM 2.0;" }),
      });
      const res = await handler(req, contextWithEnv);
      expect(res.status).toBe(HTTP_STATUS_OK);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("proxies POST /auth/save with bearer token to upstream", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ saved: true }), {
          status: HTTP_STATUS_OK,
          headers: { "Content-Type": "application/json" },
        })
      );
      vi.stubGlobal("fetch", fetchMock);

      const bearerToken = await createSignedJwt();
      const req = new Request("https://example.test/.netlify/functions/quantum-proxy/auth/save", {
        method: "POST",
        headers: {
          Origin: TEST_CORS_ORIGIN,
          authorization: `Bearer ${bearerToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ circuit: "OPENQASM 2.0;" }),
      });
      const res = await handler(req, contextWithEnv);
      expect(res.status).toBe(HTTP_STATUS_OK);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("proxies POST /auth/clear with bearer token to upstream", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ cleared: true }), {
          status: HTTP_STATUS_OK,
          headers: { "Content-Type": "application/json" },
        })
      );
      vi.stubGlobal("fetch", fetchMock);

      const bearerToken = await createSignedJwt();
      const req = new Request("https://example.test/.netlify/functions/quantum-proxy/auth/clear", {
        method: "POST",
        headers: {
          Origin: TEST_CORS_ORIGIN,
          authorization: `Bearer ${bearerToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ circuit: "OPENQASM 2.0;" }),
      });
      const res = await handler(req, contextWithEnv);
      expect(res.status).toBe(HTTP_STATUS_OK);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("proxies POST /loop/start with bearer token to upstream", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ status: "started", loop_id: "real-loop-1" }), {
          status: HTTP_STATUS_OK,
          headers: { "Content-Type": "application/json" },
        })
      );
      vi.stubGlobal("fetch", fetchMock);

      const bearerToken = await createSignedJwt();
      const req = new Request("https://example.test/.netlify/functions/quantum-proxy/loop/start", {
        method: "POST",
        headers: {
          Origin: TEST_CORS_ORIGIN,
          authorization: `Bearer ${bearerToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ circuit: "OPENQASM 2.0;" }),
      });
      const res = await handler(req, contextWithEnv);
      expect(res.status).toBe(HTTP_STATUS_OK);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("proxies POST /loop/stop with bearer token to upstream", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ status: "stopped" }), {
          status: HTTP_STATUS_OK,
          headers: { "Content-Type": "application/json" },
        })
      );
      vi.stubGlobal("fetch", fetchMock);

      const bearerToken = await createSignedJwt();
      const req = new Request("https://example.test/.netlify/functions/quantum-proxy/loop/stop", {
        method: "POST",
        headers: {
          Origin: TEST_CORS_ORIGIN,
          authorization: `Bearer ${bearerToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ circuit: "OPENQASM 2.0;" }),
      });
      const res = await handler(req, contextWithEnv);
      expect(res.status).toBe(HTTP_STATUS_OK);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("proxies POST /result/histogram with bearer token to upstream", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ histogram: {} }), {
          status: HTTP_STATUS_OK,
          headers: { "Content-Type": "application/json" },
        })
      );
      vi.stubGlobal("fetch", fetchMock);

      const bearerToken = await createSignedJwt();
      const req = new Request("https://example.test/.netlify/functions/quantum-proxy/result/histogram", {
        method: "POST",
        headers: {
          Origin: TEST_CORS_ORIGIN,
          authorization: `Bearer ${bearerToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ circuit: "OPENQASM 2.0;" }),
      });
      const res = await handler(req, contextWithEnv);
      expect(res.status).toBe(HTTP_STATUS_OK);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("only forwards safe response headers from upstream", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ status: "ready" }), {
          status: HTTP_STATUS_OK,
          headers: {
            "Content-Type": "application/json",
            "X-Custom-Unsafe-Header": "should-not-be-forwarded",
            "Set-Cookie": "session=abc; HttpOnly",
            "Cache-Control": "max-age=60",
          },
        })
      );
      vi.stubGlobal("fetch", fetchMock);

      const req = makeNetlifyRequest("/.netlify/functions/quantum-proxy/status");
      const res = await handler(req, contextWithEnv);
      expect(res.status).toBe(HTTP_STATUS_OK);
      expect(res.headers.get("X-Custom-Unsafe-Header")).toBeNull();
      expect(res.headers.get("Set-Cookie")).toBeNull();
      expect(res.headers.get("Cache-Control")).toBe("max-age=60");
    });

    it("sets X-Content-Type-Options: nosniff on all responses", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ status: "ready" }), {
          status: HTTP_STATUS_OK,
          headers: { "Content-Type": "application/json" },
        })
      );
      vi.stubGlobal("fetch", fetchMock);

      const req = makeNetlifyRequest("/.netlify/functions/quantum-proxy/status");
      const res = await handler(req, contextWithEnv);
      expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    });

    it("proxies GET /qasm/circuit/ascii with bearer token to upstream", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response("<html>circuit</html>", {
          status: HTTP_STATUS_OK,
          headers: { "Content-Type": "text/html" },
        })
      );
      vi.stubGlobal("fetch", fetchMock);

      const bearerToken = await createSignedJwt();
      const req = new Request("https://example.test/.netlify/functions/quantum-proxy/qasm/circuit/ascii", {
        method: "GET",
        headers: {
          Origin: TEST_CORS_ORIGIN,
          authorization: `Bearer ${bearerToken}`,
          "Content-Type": "application/json",
        },
      });
      const res = await handler(req, contextWithEnv);
      expect(res.status).toBe(HTTP_STATUS_OK);
      expect(fetchMock).toHaveBeenCalledTimes(1);
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

  // ─────────────────────────────────────────────────────────────────────────
  // Allowlist parity: Netlify ↔ Go
  //
  // NETLIFY_PATHS_STRIPPED is derived from the exported ALLOWED_PATHS Set in
  // quantum-proxy.mts — this ensures parity tests automatically reflect any
  // additions to the Netlify allowlist without requiring manual updates here.
  //
  // GO_PREFIXES mirrors allowedQuantumPaths in pkg/api/handlers/quantum_proxy.go
  // and MUST be kept in sync manually (Go is not importable from TypeScript tests).
  //
  // The Go backend intentionally exposes cluster-internal prefixes
  // (circuit, health, job) that are not browser-reachable via Netlify;
  // these are tracked in GO_INTERNAL_ONLY_PREFIXES below.
  // ─────────────────────────────────────────────────────────────────────────
  describe("Allowlist parity: Netlify ↔ Go", () => {
   // Derived from the exported ALLOWED_PATHS constant in quantum-proxy.mts
   // (strips the leading "/" from each entry so we can match Go prefixes).
   const NETLIFY_PATHS_STRIPPED = [...ALLOWED_PATHS].map((p) => p.replace(/^\//, ""));

   // Mirrors allowedQuantumPaths in quantum_proxy.go (prefix-match list).
   // Update this when pkg/api/handlers/quantum_proxy.go changes.
   const GO_PREFIXES = [
     "auth",
     "circuit",
     "execute",
     "health",
     "job",
     "loop",
     "qasm",
     "qubits",
     "result",
     "status",
   ];

   // Go-backend-only prefixes that are intentionally NOT exposed via Netlify.
   // These are cluster-internal endpoints not needed by the browser client.
   // Before adding an entry here, confirm the exclusion is deliberate.
   const GO_INTERNAL_ONLY_PREFIXES = new Set(["circuit", "health", "job"]);

   it("every Netlify ALLOWED_PATHS entry has a matching Go allowedQuantumPaths prefix (Netlify→Go direction)", () => {
     for (const path of NETLIFY_PATHS_STRIPPED) {
       const covered = GO_PREFIXES.some(
         (prefix) => path === prefix || path.startsWith(`${prefix}/`),
       );
       expect(
         covered,
         `Netlify path "/${path}" has no matching Go prefix — add it to ` +
           `allowedQuantumPaths in pkg/api/handlers/quantum_proxy.go`,
       ).toBe(true);
     }
   });

   it("every Go allowedQuantumPaths prefix is either in Netlify ALLOWED_PATHS or documented as intentionally internal-only (Go→Netlify direction)", () => {
     for (const prefix of GO_PREFIXES) {
       if (GO_INTERNAL_ONLY_PREFIXES.has(prefix)) {
         // Intentionally internal-only — skip Netlify coverage check.
         continue;
       }
       const covered = NETLIFY_PATHS_STRIPPED.some(
         (path) => path === prefix || path.startsWith(`${prefix}/`),
       );
       expect(
         covered,
         `Go prefix "${prefix}" is not covered by any Netlify ALLOWED_PATHS entry and is not in ` +
           `GO_INTERNAL_ONLY_PREFIXES — either add it to Netlify or document the intentional gap`,
       ).toBe(true);
     }
   });

   it.each(NETLIFY_PATHS_STRIPPED)(
     "GET /%s is allowed (returns non-400/405) in demo mode",
     async (path) => {
       const req = makeNetlifyRequest(
         `/.netlify/functions/quantum-proxy/${path}`,
       );
       const res = await handler(req, makeContext());
       expect(res.status).not.toBe(HTTP_STATUS_BAD_REQUEST);
       expect(res.status).not.toBe(HTTP_STATUS_METHOD_NOT_ALLOWED);
     },
   );
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Path-traversal corpus (Netlify isAllowedPath hardening)
  //
  // Reproduces the encoding/normalisation variants documented in #17335.
  // The Go TestIsAllowedQuantumPath covers literal parent-directory sequences
  // (e.g. "../auth", "auth/../status") but does NOT cover the percent-encoded
  // or double-encoded variants below. This suite brings Netlify's isAllowedPath
  // to parity on the full encoding/normalisation attack surface.
  // ─────────────────────────────────────────────────────────────────────────
  describe("Path-traversal corpus (isAllowedPath hardening)", () => {
    const traversalCases: Array<{ label: string; path: string }> = [
      // Literal parent-directory sequences (resolved by URL parser)
      { label: "literal ../ traversal resolved by URL parser",  path: "/../status" },
      { label: "chained ../../ traversal",                      path: "/../../etc/passwd" },
      // URL-encoded variants (%2e→. %2f→/ decoded by URL parser)
      { label: "percent-encoded %2e%2e%2f",                    path: "/%2e%2e%2fstatus" },
      { label: "percent-encoded %2e%2e/",                      path: "/%2e%2e/status" },
      { label: "mixed %2e./",                                   path: "/%2e./status" },
      { label: "mixed .%2f",                                    path: "/..%2fstatus" },
      // Double-encoded (%25 decoded to %, leaving %2e for second round)
      { label: "double-encoded %252e%252e%252f",               path: "/%252e%252e%252fstatus" },
      { label: "double-encoded %252e%252e/",                   path: "/%252e%252e/status" },
      // Slash injection
      { label: "double-slash //status",                         path: "//status" },
      { label: "triple-slash ///status",                        path: "///status" },
      // Windows-style backslash (contains .. so caught by traversal check)
      { label: "Windows ..%5C backslash traversal",             path: "/..%5Cstatus" },
      // Scheme injection / SSRF
      { label: "http:// scheme injection (SSRF)",               path: "/http://evil.example.com/status" },
      { label: "https:// scheme injection (SSRF)",              path: "/https://evil.example.com/status" },
      // Protocol-relative
      { label: "protocol-relative //evil.example.com",          path: "//evil.example.com/status" },
      // Unicode look-alike fullwidth dots (U+FF0E, not matched by isAllowedPath, blocked by allowlist)
      { label: "Unicode fullwidth dots %EF%BC%8E%EF%BC%8E",    path: "/%EF%BC%8E%EF%BC%8E/status" },
      // Null-byte injection (percent-encoded %00 does not match any allowlisted path)
      { label: "null byte %00 between path segments",           path: "/status%00.evil" },
      // Single-encoded backslash (%5C alone, no ..) blocked by allowlist
      { label: "backslash-only %5C path injection",             path: "/%5Cstatus" },
    ];

    it.each(traversalCases)(
      "rejects $label → 400 Invalid proxy path",
      async ({ path }) => {
        const req = makeNetlifyRequest(
          `/.netlify/functions/quantum-proxy${path}`,
        );
        const res = await handler(req, makeContext());
        expect(res.status).toBe(HTTP_STATUS_BAD_REQUEST);
        const body = await readJson<{ error: string }>(res);
        expect(body.error).toBe("Invalid proxy path");
      },
    );
  });
});
