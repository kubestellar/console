// @vitest-environment node
/**
 * Unit tests for the shared CORS helper module.
 *
 * The CORS module is security-critical: OWASP ZAP flagged
 * "Cross-Domain Misconfiguration" (#9879) and this helper enforces an
 * explicit origin allowlist. Every code path needs regression coverage.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

import {
  isAllowedOrigin,
  buildCorsHeaders,
  handlePreflight,
  getStrictKubestellarCorsOrigin,
  buildStrictKubestellarCorsHeaders,
  STRICT_KUBESTELLAR_ORIGINS,
} from "../_shared/cors";

// ── Helpers ─────────────────────────────────────────────────────────────

function makeRequest(origin: string | null, method = "GET"): Request {
  const headers = new Headers();
  if (origin) {
    headers.set("origin", origin);
  }
  return new Request("https://console.kubestellar.io/api/test", {
    method,
    headers,
  });
}

// ── isAllowedOrigin ─────────────────────────────────────────────────────

describe("isAllowedOrigin", () => {
  const savedEnv = { ...process.env };

  beforeEach(() => {
    // Default to test environment so localhost is allowed
    process.env.NODE_ENV = "test";
  });

  afterEach(() => {
    process.env = { ...savedEnv };
  });

  describe("exact-match allowlist", () => {
    it("accepts production origin", () => {
      expect(isAllowedOrigin("https://console.kubestellar.io")).toBe(true);
    });

    it("accepts docs.kubestellar.io", () => {
      expect(isAllowedOrigin("https://docs.kubestellar.io")).toBe(true);
    });

    it("accepts kubestellar.io", () => {
      expect(isAllowedOrigin("https://kubestellar.io")).toBe(true);
    });

    it("accepts www.kubestellar.io", () => {
      expect(isAllowedOrigin("https://www.kubestellar.io")).toBe(true);
    });
  });

  describe("Netlify preview deploys", () => {
    it("accepts branch preview deploys", () => {
      expect(
        isAllowedOrigin("https://feature-xyz--kubestellar-console.netlify.app"),
      ).toBe(true);
    });

    it("accepts PR deploy previews", () => {
      expect(
        isAllowedOrigin(
          "https://deploy-preview-1234--kubestellar-console.netlify.app",
        ),
      ).toBe(true);
    });

    it("accepts docs site preview deploys", () => {
      expect(
        isAllowedOrigin("https://fix-docs--kubestellar-docs.netlify.app"),
      ).toBe(true);
    });

    it("rejects preview deploys for other sites", () => {
      expect(
        isAllowedOrigin("https://feature-xyz--evil-site.netlify.app"),
      ).toBe(false);
    });
  });

  describe("localhost (development only)", () => {
    it("accepts localhost in test environment", () => {
      process.env.NODE_ENV = "test";
      expect(isAllowedOrigin("http://localhost:5174")).toBe(true);
    });

    it("accepts localhost in development environment", () => {
      process.env.NODE_ENV = "development";
      expect(isAllowedOrigin("http://localhost:5174")).toBe(true);
    });

    it("accepts 127.0.0.1 in development", () => {
      process.env.NODE_ENV = "development";
      expect(isAllowedOrigin("http://127.0.0.1:3000")).toBe(true);
    });

    it("accepts localhost without port", () => {
      process.env.NODE_ENV = "test";
      expect(isAllowedOrigin("http://localhost")).toBe(true);
    });

    it("rejects localhost in production", () => {
      process.env.NODE_ENV = "production";
      process.env.NETLIFY_DEV = undefined;
      expect(isAllowedOrigin("http://localhost:5174")).toBe(false);
    });
  });

  describe("rejection cases", () => {
    it("rejects null origin", () => {
      expect(isAllowedOrigin(null)).toBe(false);
    });

    it("rejects undefined origin", () => {
      expect(isAllowedOrigin(undefined)).toBe(false);
    });

    it("rejects empty string origin", () => {
      expect(isAllowedOrigin("")).toBe(false);
    });

    it("rejects arbitrary origins", () => {
      expect(isAllowedOrigin("https://evil.example.com")).toBe(false);
    });

    it("rejects origin with matching suffix but different domain", () => {
      expect(isAllowedOrigin("https://notkubestellar.io")).toBe(false);
    });

    it("rejects http version of production origin", () => {
      expect(isAllowedOrigin("http://console.kubestellar.io")).toBe(false);
    });

    it("rejects origin with path appended", () => {
      expect(isAllowedOrigin("https://console.kubestellar.io/evil")).toBe(
        false,
      );
    });
  });
});

// ── getStrictKubestellarCorsOrigin ──────────────────────────────────────

describe("getStrictKubestellarCorsOrigin", () => {
  const savedEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...savedEnv };
  });

  it("returns origin for console.kubestellar.io", () => {
    expect(
      getStrictKubestellarCorsOrigin("https://console.kubestellar.io"),
    ).toBe("https://console.kubestellar.io");
  });

  it("returns origin for docs.kubestellar.io", () => {
    expect(
      getStrictKubestellarCorsOrigin("https://docs.kubestellar.io"),
    ).toBe("https://docs.kubestellar.io");
  });

  it("returns null for Netlify preview (not in strict set)", () => {
    expect(
      getStrictKubestellarCorsOrigin(
        "https://feature--kubestellar-console.netlify.app",
      ),
    ).toBeNull();
  });

  it("returns null for null origin", () => {
    expect(getStrictKubestellarCorsOrigin(null)).toBeNull();
  });

  it("returns localhost in dev mode", () => {
    process.env.NODE_ENV = "development";
    expect(
      getStrictKubestellarCorsOrigin("http://localhost:5174"),
    ).toBe("http://localhost:5174");
  });

  it("rejects localhost in production", () => {
    process.env.NODE_ENV = "production";
    process.env.NETLIFY_DEV = undefined;
    expect(
      getStrictKubestellarCorsOrigin("http://localhost:5174"),
    ).toBeNull();
  });
});

// ── STRICT_KUBESTELLAR_ORIGINS ──────────────────────────────────────────

describe("STRICT_KUBESTELLAR_ORIGINS", () => {
  it("contains console and docs origins", () => {
    expect(STRICT_KUBESTELLAR_ORIGINS).toContain(
      "https://console.kubestellar.io",
    );
    expect(STRICT_KUBESTELLAR_ORIGINS).toContain(
      "https://docs.kubestellar.io",
    );
  });

  it("is a readonly tuple", () => {
    expect(STRICT_KUBESTELLAR_ORIGINS.length).toBe(2);
  });
});

// ── buildStrictKubestellarCorsHeaders ───────────────────────────────────

describe("buildStrictKubestellarCorsHeaders", () => {
  it("includes Allow-Origin for allowed origin", () => {
    const headers = buildStrictKubestellarCorsHeaders(
      "https://console.kubestellar.io",
    );
    expect(headers["Access-Control-Allow-Origin"]).toBe(
      "https://console.kubestellar.io",
    );
  });

  it("omits Allow-Origin for disallowed origin", () => {
    const headers = buildStrictKubestellarCorsHeaders(
      "https://evil.example.com",
    );
    expect(headers["Access-Control-Allow-Origin"]).toBeUndefined();
  });

  it("always includes Vary: Origin", () => {
    const headers = buildStrictKubestellarCorsHeaders(null);
    expect(headers.Vary).toBe("Origin");
  });

  it("uses default methods and headers", () => {
    const headers = buildStrictKubestellarCorsHeaders(
      "https://console.kubestellar.io",
    );
    expect(headers["Access-Control-Allow-Methods"]).toBe("GET, OPTIONS");
    expect(headers["Access-Control-Allow-Headers"]).toBe("Content-Type");
  });

  it("accepts custom methods and headers options", () => {
    const headers = buildStrictKubestellarCorsHeaders(
      "https://console.kubestellar.io",
      { methods: "POST, OPTIONS", headers: "Authorization" },
    );
    expect(headers["Access-Control-Allow-Methods"]).toBe("POST, OPTIONS");
    expect(headers["Access-Control-Allow-Headers"]).toBe("Authorization");
  });
});

// ── buildCorsHeaders ────────────────────────────────────────────────────

describe("buildCorsHeaders", () => {
  it("echoes allowed origin in Access-Control-Allow-Origin", () => {
    const req = makeRequest("https://console.kubestellar.io");
    const headers = buildCorsHeaders(req, { methods: "GET, OPTIONS" });
    expect(headers["Access-Control-Allow-Origin"]).toBe(
      "https://console.kubestellar.io",
    );
  });

  it("omits Access-Control-Allow-Origin for disallowed origin", () => {
    const req = makeRequest("https://evil.example.com");
    const headers = buildCorsHeaders(req, { methods: "GET, OPTIONS" });
    expect(headers["Access-Control-Allow-Origin"]).toBeUndefined();
  });

  it("always includes X-Content-Type-Options: nosniff", () => {
    const req = makeRequest("https://evil.example.com");
    const headers = buildCorsHeaders(req, { methods: "GET" });
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
  });

  it("always includes Vary: Origin", () => {
    const req = makeRequest(null);
    const headers = buildCorsHeaders(req, { methods: "GET" });
    expect(headers.Vary).toBe("Origin");
  });

  it("includes Allow-Methods for allowed origin", () => {
    const req = makeRequest("https://console.kubestellar.io");
    const headers = buildCorsHeaders(req, { methods: "POST, OPTIONS" });
    expect(headers["Access-Control-Allow-Methods"]).toBe("POST, OPTIONS");
  });

  it("omits Allow-Methods for disallowed origin", () => {
    const req = makeRequest("https://evil.example.com");
    const headers = buildCorsHeaders(req, { methods: "POST, OPTIONS" });
    expect(headers["Access-Control-Allow-Methods"]).toBeUndefined();
  });

  it("includes Allow-Headers when specified for allowed origin", () => {
    const req = makeRequest("https://console.kubestellar.io");
    const headers = buildCorsHeaders(req, {
      methods: "POST",
      headers: "Content-Type, Authorization",
    });
    expect(headers["Access-Control-Allow-Headers"]).toBe(
      "Content-Type, Authorization",
    );
  });

  it("includes Expose-Headers when specified for allowed origin", () => {
    const req = makeRequest("https://console.kubestellar.io");
    const headers = buildCorsHeaders(req, {
      methods: "GET",
      exposeHeaders: "X-Custom-Header",
    });
    expect(headers["Access-Control-Expose-Headers"]).toBe("X-Custom-Header");
  });
});

// ── handlePreflight ─────────────────────────────────────────────────────

describe("handlePreflight", () => {
  it("returns 204 for allowed origin", () => {
    const req = makeRequest("https://console.kubestellar.io", "OPTIONS");
    const res = handlePreflight(req, { methods: "GET, OPTIONS" });
    expect(res.status).toBe(204);
  });

  it("returns 403 for disallowed origin", () => {
    const req = makeRequest("https://evil.example.com", "OPTIONS");
    const res = handlePreflight(req, { methods: "GET, OPTIONS" });
    expect(res.status).toBe(403);
  });

  it("returns 403 for null origin", () => {
    const req = makeRequest(null, "OPTIONS");
    const res = handlePreflight(req, { methods: "GET, OPTIONS" });
    expect(res.status).toBe(403);
  });

  it("includes CORS headers in response", () => {
    const req = makeRequest("https://console.kubestellar.io", "OPTIONS");
    const res = handlePreflight(req, { methods: "POST, OPTIONS" });
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://console.kubestellar.io",
    );
    expect(res.headers.get("Access-Control-Allow-Methods")).toBe(
      "POST, OPTIONS",
    );
  });

  it("has null body", () => {
    const req = makeRequest("https://console.kubestellar.io", "OPTIONS");
    const res = handlePreflight(req, { methods: "GET, OPTIONS" });
    expect(res.body).toBeNull();
  });
});
