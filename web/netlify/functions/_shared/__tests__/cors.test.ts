/**
 * Unit tests for cors.ts (#16109).
 * Tests CORS origin validation, header building, and preflight handling.
 */
import { describe, expect, it } from "vitest";
import {
  isAllowedOrigin,
  buildCorsHeaders,
  handlePreflight,
  type CorsOptions,
} from "../cors";

describe("cors", () => {
  describe("isAllowedOrigin", () => {
    it("should allow production origin", () => {
      expect(isAllowedOrigin("https://console.kubestellar.io")).toBe(true);
    });

    it("should allow docs origins", () => {
      expect(isAllowedOrigin("https://kubestellar.io")).toBe(true);
      expect(isAllowedOrigin("https://www.kubestellar.io")).toBe(true);
    });

    it("should allow Netlify preview deploys", () => {
      expect(isAllowedOrigin("https://main--kubestellar-console.netlify.app")).toBe(true);
      expect(isAllowedOrigin("https://fix-123--kubestellar-console.netlify.app")).toBe(true);
    });

    it("should allow Netlify PR deploys", () => {
      expect(isAllowedOrigin("https://deploy-preview-42--kubestellar-console.netlify.app")).toBe(true);
      expect(isAllowedOrigin("https://deploy-preview-1000--kubestellar-console.netlify.app")).toBe(true);
    });

    it("should allow Netlify docs deploys", () => {
      expect(isAllowedOrigin("https://main--kubestellar-docs.netlify.app")).toBe(true);
      expect(isAllowedOrigin("https://fix-docs--kubestellar-docs.netlify.app")).toBe(true);
    });

    it("should allow localhost development origins", () => {
      expect(isAllowedOrigin("http://localhost:5173")).toBe(true);
      expect(isAllowedOrigin("http://localhost:5174")).toBe(true);
      expect(isAllowedOrigin("http://localhost:8080")).toBe(true);
      expect(isAllowedOrigin("http://localhost:8888")).toBe(true);
      expect(isAllowedOrigin("http://127.0.0.1:5174")).toBe(true);
    });

    it("should reject disallowed origins", () => {
      expect(isAllowedOrigin("https://evil.com")).toBe(false);
      expect(isAllowedOrigin("https://example.com")).toBe(false);
      expect(isAllowedOrigin("http://malicious.netlify.app")).toBe(false);
    });

    it("should reject null origin", () => {
      expect(isAllowedOrigin(null)).toBe(false);
    });

    it("should reject undefined origin", () => {
      expect(isAllowedOrigin(undefined)).toBe(false);
    });

    it("should reject empty string origin", () => {
      expect(isAllowedOrigin("")).toBe(false);
    });

    it("should reject http production origin (not https)", () => {
      expect(isAllowedOrigin("http://console.kubestellar.io")).toBe(false);
    });

    it("should reject localhost with wrong port", () => {
      expect(isAllowedOrigin("http://localhost:3000")).toBe(false);
      expect(isAllowedOrigin("http://localhost:9999")).toBe(false);
    });

    it("should reject Netlify deploy with wrong site name", () => {
      expect(isAllowedOrigin("https://main--other-site.netlify.app")).toBe(false);
    });

    it("should be case-insensitive for Netlify patterns", () => {
      expect(isAllowedOrigin("https://MAIN--kubestellar-console.netlify.app")).toBe(true);
      expect(isAllowedOrigin("https://Fix-123--KUBESTELLAR-CONSOLE.NETLIFY.APP")).toBe(true);
    });
  });

  describe("buildCorsHeaders", () => {
    const defaultOpts: CorsOptions = {
      methods: "GET, OPTIONS",
      headers: "Content-Type",
    };

    it("should include CORS headers for allowed origin", () => {
      const request = new Request("http://example.com", {
        headers: { origin: "https://console.kubestellar.io" },
      });
      const headers = buildCorsHeaders(request, defaultOpts);

      expect(headers["Access-Control-Allow-Origin"]).toBe("https://console.kubestellar.io");
      expect(headers["Access-Control-Allow-Methods"]).toBe("GET, OPTIONS");
      expect(headers["Access-Control-Allow-Headers"]).toBe("Content-Type");
    });

    it("should omit CORS headers for disallowed origin", () => {
      const request = new Request("http://example.com", {
        headers: { origin: "https://evil.com" },
      });
      const headers = buildCorsHeaders(request, defaultOpts);

      expect(headers["Access-Control-Allow-Origin"]).toBeUndefined();
      expect(headers["Access-Control-Allow-Methods"]).toBeUndefined();
      expect(headers["Access-Control-Allow-Headers"]).toBeUndefined();
    });

    it("should always include X-Content-Type-Options: nosniff", () => {
      const request = new Request("http://example.com", {
        headers: { origin: "https://console.kubestellar.io" },
      });
      const headers = buildCorsHeaders(request, defaultOpts);

      expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    });

    it("should always include Vary: Origin", () => {
      const request = new Request("http://example.com", {
        headers: { origin: "https://console.kubestellar.io" },
      });
      const headers = buildCorsHeaders(request, defaultOpts);

      expect(headers["Vary"]).toBe("Origin");
    });

    it("should include expose headers when provided", () => {
      const request = new Request("http://example.com", {
        headers: { origin: "https://console.kubestellar.io" },
      });
      const headers = buildCorsHeaders(request, {
        ...defaultOpts,
        exposeHeaders: "X-Custom-Header",
      });

      expect(headers["Access-Control-Expose-Headers"]).toBe("X-Custom-Header");
    });

    it("should omit expose headers when not provided", () => {
      const request = new Request("http://example.com", {
        headers: { origin: "https://console.kubestellar.io" },
      });
      const headers = buildCorsHeaders(request, defaultOpts);

      expect(headers["Access-Control-Expose-Headers"]).toBeUndefined();
    });

    it("should handle request without origin header", () => {
      const request = new Request("http://example.com");
      const headers = buildCorsHeaders(request, defaultOpts);

      expect(headers["Access-Control-Allow-Origin"]).toBeUndefined();
      expect(headers["X-Content-Type-Options"]).toBe("nosniff");
      expect(headers["Vary"]).toBe("Origin");
    });

    it("should handle multiple methods", () => {
      const request = new Request("http://example.com", {
        headers: { origin: "https://console.kubestellar.io" },
      });
      const headers = buildCorsHeaders(request, {
        methods: "GET, POST, PUT, DELETE, OPTIONS",
      });

      expect(headers["Access-Control-Allow-Methods"]).toBe("GET, POST, PUT, DELETE, OPTIONS");
    });

    it("should handle multiple headers", () => {
      const request = new Request("http://example.com", {
        headers: { origin: "https://console.kubestellar.io" },
      });
      const headers = buildCorsHeaders(request, {
        methods: "GET, OPTIONS",
        headers: "Content-Type, Authorization, X-Requested-With",
      });

      expect(headers["Access-Control-Allow-Headers"]).toBe("Content-Type, Authorization, X-Requested-With");
    });
  });

  describe("handlePreflight", () => {
    const defaultOpts: CorsOptions = {
      methods: "GET, OPTIONS",
      headers: "Content-Type",
    };

    it("should return 204 for allowed origin", () => {
      const request = new Request("http://example.com", {
        headers: { origin: "https://console.kubestellar.io" },
      });
      const response = handlePreflight(request, defaultOpts);

      expect(response.status).toBe(204);
    });

    it("should return 403 for disallowed origin", () => {
      const request = new Request("http://example.com", {
        headers: { origin: "https://evil.com" },
      });
      const response = handlePreflight(request, defaultOpts);

      expect(response.status).toBe(403);
    });

    it("should include CORS headers in response", async () => {
      const request = new Request("http://example.com", {
        headers: { origin: "https://console.kubestellar.io" },
      });
      const response = handlePreflight(request, defaultOpts);

      expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://console.kubestellar.io");
      expect(response.headers.get("Access-Control-Allow-Methods")).toBe("GET, OPTIONS");
    });

    it("should return empty body", async () => {
      const request = new Request("http://example.com", {
        headers: { origin: "https://console.kubestellar.io" },
      });
      const response = handlePreflight(request, defaultOpts);

      const text = await response.text();
      expect(text).toBe("");
    });

    it("should return 403 for missing origin", () => {
      const request = new Request("http://example.com");
      const response = handlePreflight(request, defaultOpts);

      expect(response.status).toBe(403);
    });
  });
});
