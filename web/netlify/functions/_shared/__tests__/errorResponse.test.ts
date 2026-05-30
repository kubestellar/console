/**
 * Unit tests for errorResponse.ts (#16109).
 * Tests error response formatting, status codes, and header handling.
 */
import { describe, expect, it } from "vitest";
import {
  errorResponse,
  rateLimitResponse,
  badRequestResponse,
  unauthorizedResponse,
  notFoundResponse,
  serverErrorResponse,
} from "../errorResponse";

describe("errorResponse", () => {
  describe("errorResponse", () => {
    it("should return 500 status by default", async () => {
      const response = errorResponse("Something went wrong");

      expect(response.status).toBe(500);
    });

    it("should return JSON body with error message", async () => {
      const response = errorResponse("Something went wrong");
      const body = await response.json();

      expect(body).toEqual({ error: "Something went wrong" });
    });

    it("should set Content-Type to application/json", () => {
      const response = errorResponse("Error");

      expect(response.headers.get("Content-Type")).toBe("application/json");
    });

    it("should use custom status code when provided", async () => {
      const response = errorResponse("Bad request", { status: 400 });

      expect(response.status).toBe(400);
    });

    it("should merge custom headers", () => {
      const response = errorResponse("Error", {
        headers: {
          "X-Custom-Header": "value",
          "Cache-Control": "no-cache",
        },
      });

      expect(response.headers.get("X-Custom-Header")).toBe("value");
      expect(response.headers.get("Cache-Control")).toBe("no-cache");
      expect(response.headers.get("Content-Type")).toBe("application/json");
    });

    it("should handle empty error message", async () => {
      const response = errorResponse("");
      const body = await response.json();

      expect(body).toEqual({ error: "" });
    });

    it("should handle various status codes", () => {
      const testCases = [400, 401, 403, 404, 429, 500, 502, 503];

      for (const status of testCases) {
        const response = errorResponse("Error", { status });
        expect(response.status).toBe(status);
      }
    });
  });

  describe("rateLimitResponse", () => {
    it("should return 429 status", () => {
      const response = rateLimitResponse(60);

      expect(response.status).toBe(429);
    });

    it("should include Retry-After header", () => {
      const response = rateLimitResponse(120);

      expect(response.headers.get("Retry-After")).toBe("120");
    });

    it("should return JSON body with error and retryAfter", async () => {
      const response = rateLimitResponse(60);
      const body = await response.json();

      expect(body).toEqual({
        error: "Rate limit exceeded",
        retryAfter: 60,
      });
    });

    it("should merge custom headers", () => {
      const response = rateLimitResponse(60, {
        "X-Rate-Limit-Reset": "2024-01-01T00:00:00Z",
      });

      expect(response.headers.get("X-Rate-Limit-Reset")).toBe("2024-01-01T00:00:00Z");
      expect(response.headers.get("Retry-After")).toBe("60");
    });

    it("should handle zero retryAfter", async () => {
      const response = rateLimitResponse(0);
      const body = await response.json();

      expect(body.retryAfter).toBe(0);
      expect(response.headers.get("Retry-After")).toBe("0");
    });

    it("should handle large retryAfter values", async () => {
      const response = rateLimitResponse(86400); // 24 hours
      const body = await response.json();

      expect(body.retryAfter).toBe(86400);
    });
  });

  describe("badRequestResponse", () => {
    it("should return 400 status", () => {
      const response = badRequestResponse("Invalid input");

      expect(response.status).toBe(400);
    });

    it("should return JSON body with error message", async () => {
      const response = badRequestResponse("Invalid input");
      const body = await response.json();

      expect(body).toEqual({ error: "Invalid input" });
    });

    it("should merge custom headers", () => {
      const response = badRequestResponse("Error", {
        "X-Custom": "header",
      });

      expect(response.headers.get("X-Custom")).toBe("header");
    });
  });

  describe("unauthorizedResponse", () => {
    it("should return 401 status", () => {
      const response = unauthorizedResponse();

      expect(response.status).toBe(401);
    });

    it("should use default message", async () => {
      const response = unauthorizedResponse();
      const body = await response.json();

      expect(body).toEqual({ error: "Unauthorized" });
    });

    it("should use custom message when provided", async () => {
      const response = unauthorizedResponse("Invalid token");
      const body = await response.json();

      expect(body).toEqual({ error: "Invalid token" });
    });

    it("should merge custom headers", () => {
      const response = unauthorizedResponse("Error", {
        "WWW-Authenticate": 'Bearer realm="api"',
      });

      expect(response.headers.get("WWW-Authenticate")).toBe('Bearer realm="api"');
    });
  });

  describe("notFoundResponse", () => {
    it("should return 404 status", () => {
      const response = notFoundResponse("Resource not found");

      expect(response.status).toBe(404);
    });

    it("should return JSON body with error message", async () => {
      const response = notFoundResponse("User not found");
      const body = await response.json();

      expect(body).toEqual({ error: "User not found" });
    });

    it("should merge custom headers", () => {
      const response = notFoundResponse("Error", {
        "X-Request-Id": "12345",
      });

      expect(response.headers.get("X-Request-Id")).toBe("12345");
    });
  });

  describe("serverErrorResponse", () => {
    it("should return 500 status", () => {
      const response = serverErrorResponse();

      expect(response.status).toBe(500);
    });

    it("should use default message", async () => {
      const response = serverErrorResponse();
      const body = await response.json();

      expect(body).toEqual({ error: "Internal server error" });
    });

    it("should use custom message when provided", async () => {
      const response = serverErrorResponse("Database connection failed");
      const body = await response.json();

      expect(body).toEqual({ error: "Database connection failed" });
    });

    it("should merge custom headers", () => {
      const response = serverErrorResponse("Error", {
        "X-Error-Id": "err-12345",
      });

      expect(response.headers.get("X-Error-Id")).toBe("err-12345");
    });
  });

  describe("response header consistency", () => {
    it("should always set Content-Type to application/json", () => {
      const responses = [
        errorResponse("Error"),
        rateLimitResponse(60),
        badRequestResponse("Bad"),
        unauthorizedResponse(),
        notFoundResponse("Not found"),
        serverErrorResponse(),
      ];

      for (const response of responses) {
        expect(response.headers.get("Content-Type")).toBe("application/json");
      }
    });

    it("should preserve custom headers across all response types", () => {
      const customHeaders = { "X-Test": "value" };

      const responses = [
        badRequestResponse("Error", customHeaders),
        unauthorizedResponse("Error", customHeaders),
        notFoundResponse("Error", customHeaders),
        serverErrorResponse("Error", customHeaders),
      ];

      for (const response of responses) {
        expect(response.headers.get("X-Test")).toBe("value");
      }
    });
  });
});
