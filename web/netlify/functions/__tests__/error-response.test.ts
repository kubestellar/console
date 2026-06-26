// @vitest-environment node
/**
 * Unit tests for the shared errorResponse module.
 *
 * This module provides standardized JSON error responses across all Netlify
 * Functions. Tests verify the correct status codes, headers, and body shapes
 * for each convenience function.
 */
import { describe, expect, it } from "vitest";

import {
  errorResponse,
  rateLimitResponse,
  badRequestResponse,
  unauthorizedResponse,
  notFoundResponse,
  serverErrorResponse,
} from "../_shared/errorResponse";

// ── Helpers ─────────────────────────────────────────────────────────────

async function parseBody<T>(res: Response): Promise<T> {
  return res.json() as Promise<T>;
}

// ── errorResponse ───────────────────────────────────────────────────────

describe("errorResponse", () => {
  it("returns 500 by default", () => {
    const res = errorResponse("Something went wrong");
    expect(res.status).toBe(500);
  });

  it("uses custom status code", () => {
    const res = errorResponse("Not found", { status: 404 });
    expect(res.status).toBe(404);
  });

  it("returns JSON body with error field", async () => {
    const res = errorResponse("Test error");
    const body = await parseBody<{ error: string }>(res);
    expect(body.error).toBe("Test error");
  });

  it("sets Content-Type to application/json", () => {
    const res = errorResponse("Error");
    expect(res.headers.get("Content-Type")).toBe("application/json");
  });

  it("includes custom headers", () => {
    const res = errorResponse("Error", {
      headers: { "X-Custom": "value" },
    });
    expect(res.headers.get("X-Custom")).toBe("value");
  });

  it("preserves Content-Type when custom headers are passed", () => {
    const res = errorResponse("Error", {
      headers: { "X-Foo": "bar" },
    });
    expect(res.headers.get("Content-Type")).toBe("application/json");
  });
});

// ── rateLimitResponse ───────────────────────────────────────────────────

describe("rateLimitResponse", () => {
  it("returns 429 status", () => {
    const res = rateLimitResponse(60);
    expect(res.status).toBe(429);
  });

  it("sets Retry-After header", () => {
    const res = rateLimitResponse(30);
    expect(res.headers.get("Retry-After")).toBe("30");
  });

  it("includes retryAfter in body", async () => {
    const res = rateLimitResponse(45);
    const body = await parseBody<{ error: string; retryAfter: number }>(res);
    expect(body.error).toBe("Rate limit exceeded");
    expect(body.retryAfter).toBe(45);
  });

  it("sets Content-Type to application/json", () => {
    const res = rateLimitResponse(60);
    expect(res.headers.get("Content-Type")).toBe("application/json");
  });

  it("includes custom headers", () => {
    const res = rateLimitResponse(10, { "X-Custom": "test" });
    expect(res.headers.get("X-Custom")).toBe("test");
  });
});

// ── badRequestResponse ──────────────────────────────────────────────────

describe("badRequestResponse", () => {
  it("returns 400 status", () => {
    const res = badRequestResponse("Invalid input");
    expect(res.status).toBe(400);
  });

  it("includes error message in body", async () => {
    const res = badRequestResponse("Missing field");
    const body = await parseBody<{ error: string }>(res);
    expect(body.error).toBe("Missing field");
  });

  it("includes custom headers", () => {
    const res = badRequestResponse("Error", { "X-Request-Id": "abc" });
    expect(res.headers.get("X-Request-Id")).toBe("abc");
  });
});

// ── unauthorizedResponse ────────────────────────────────────────────────

describe("unauthorizedResponse", () => {
  it("returns 401 status", () => {
    const res = unauthorizedResponse();
    expect(res.status).toBe(401);
  });

  it("uses default message when not provided", async () => {
    const res = unauthorizedResponse();
    const body = await parseBody<{ error: string }>(res);
    expect(body.error).toBe("Unauthorized");
  });

  it("uses custom message", async () => {
    const res = unauthorizedResponse("Token expired");
    const body = await parseBody<{ error: string }>(res);
    expect(body.error).toBe("Token expired");
  });

  it("includes custom headers", () => {
    const res = unauthorizedResponse("Nope", {
      "WWW-Authenticate": "Bearer",
    });
    expect(res.headers.get("WWW-Authenticate")).toBe("Bearer");
  });
});

// ── notFoundResponse ────────────────────────────────────────────────────

describe("notFoundResponse", () => {
  it("returns 404 status", () => {
    const res = notFoundResponse("Resource not found");
    expect(res.status).toBe(404);
  });

  it("includes error message in body", async () => {
    const res = notFoundResponse("User not found");
    const body = await parseBody<{ error: string }>(res);
    expect(body.error).toBe("User not found");
  });
});

// ── serverErrorResponse ─────────────────────────────────────────────────

describe("serverErrorResponse", () => {
  it("returns 500 status", () => {
    const res = serverErrorResponse();
    expect(res.status).toBe(500);
  });

  it("uses default message when not provided", async () => {
    const res = serverErrorResponse();
    const body = await parseBody<{ error: string }>(res);
    expect(body.error).toBe("Internal server error");
  });

  it("uses custom message", async () => {
    const res = serverErrorResponse("Database unavailable");
    const body = await parseBody<{ error: string }>(res);
    expect(body.error).toBe("Database unavailable");
  });
});
