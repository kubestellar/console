// @vitest-environment node
/**
 * Unit tests for jwt-validation.ts (#17355).
 * Covers validateJWT, validateBearerToken, structural validation, and
 * critical security properties (alg:none bypass, expired tokens, bad signatures).
 */
import { SignJWT } from "jose";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { validateBearerToken, validateJWT } from "../_shared/jwt-validation";

const TEST_SECRET = "test-secret-key-for-unit-tests-32chars";

/** Build a signed HS256 JWT with the given payload and secret. */
async function signToken(
  payload: Record<string, unknown>,
  secret = TEST_SECRET,
  options: { expiresIn?: string } = { expiresIn: "1h" },
): Promise<string> {
  let builder = new SignJWT(payload).setProtectedHeader({ alg: "HS256" });
  if (options.expiresIn) {
    builder = builder.setExpirationTime(options.expiresIn);
  }
  return builder.sign(new TextEncoder().encode(secret));
}

/** Manually craft a JWT with a custom header alg (unsigned / no real signature). */
function craftTokenWithAlg(alg: string, payload: Record<string, unknown> = {}): string {
  const header = Buffer.from(JSON.stringify({ alg, typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.fakesignature`;
}

describe("validateJWT", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  describe("structural validation", () => {
    it("rejects empty string", async () => {
      const result = await validateJWT("", TEST_SECRET);
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/required/i);
    });

    it("rejects non-string (null coerced)", async () => {
      // @ts-expect-error intentional bad input
      const result = await validateJWT(null, TEST_SECRET);
      expect(result.valid).toBe(false);
    });

    it("rejects token with fewer than 3 parts", async () => {
      const result = await validateJWT("header.payload", TEST_SECRET);
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/3 parts/i);
    });

    it("rejects token with more than 3 parts", async () => {
      const result = await validateJWT("a.b.c.d", TEST_SECRET);
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/3 parts/i);
    });

    it("rejects invalid base64url in header", async () => {
      const result = await validateJWT("!!!.payload.sig", TEST_SECRET);
      expect(result.valid).toBe(false);
    });

    it("rejects non-JSON header", async () => {
      const badHeader = Buffer.from("not-json").toString("base64url");
      const result = await validateJWT(`${badHeader}.payload.sig`, TEST_SECRET);
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/header/i);
    });

    it("rejects token where alg is not a string", async () => {
      const header = Buffer.from(JSON.stringify({ alg: 42 })).toString("base64url");
      const payload = Buffer.from(JSON.stringify({})).toString("base64url");
      const result = await validateJWT(`${header}.${payload}.sig`, TEST_SECRET);
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/alg/i);
    });

    it("rejects missing signature segment", async () => {
      const header = Buffer.from(JSON.stringify({ alg: "HS256" })).toString("base64url");
      const body = Buffer.from(JSON.stringify({})).toString("base64url");
      // trailing dot means empty signature
      const result = await validateJWT(`${header}.${body}.`, TEST_SECRET);
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/signature/i);
    });
  });

  describe("security: alg:none bypass prevention", () => {
    it("rejects alg:none tokens", async () => {
      const token = craftTokenWithAlg("none");
      const result = await validateJWT(token, TEST_SECRET);
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/none/i);
    });

    it("rejects unsupported algorithm (RS256)", async () => {
      const token = craftTokenWithAlg("RS256");
      const result = await validateJWT(token, TEST_SECRET);
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/unsupported alg/i);
    });

    it("rejects unsupported algorithm (HS512)", async () => {
      const token = craftTokenWithAlg("HS512");
      const result = await validateJWT(token, TEST_SECRET);
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/unsupported alg/i);
    });
  });

  describe("expiry validation", () => {
    it("rejects expired token", async () => {
      const token = await signToken({ sub: "user1" }, TEST_SECRET, { expiresIn: "-1s" });
      const result = await validateJWT(token, TEST_SECRET);
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/expired/i);
    });

    it("accepts a non-expired token", async () => {
      const token = await signToken({ sub: "user1" }, TEST_SECRET, { expiresIn: "1h" });
      const result = await validateJWT(token, TEST_SECRET);
      expect(result.valid).toBe(true);
      expect(result.payload).toBeDefined();
    });

    it("rejects token with non-numeric exp claim", async () => {
      const header = Buffer.from(JSON.stringify({ alg: "HS256" })).toString("base64url");
      const payload = Buffer.from(JSON.stringify({ exp: "not-a-number" })).toString("base64url");
      const result = await validateJWT(`${header}.${payload}.sig`, TEST_SECRET);
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/exp/i);
    });
  });

  describe("JWT secret validation", () => {
    it("rejects when secret is missing", async () => {
      const token = await signToken({ sub: "user1" });
      const result = await validateJWT(token, undefined);
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/secret.*not configured/i);
    });

    it("rejects when secret is empty string", async () => {
      const token = await signToken({ sub: "user1" });
      const result = await validateJWT(token, "");
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/secret.*not configured/i);
    });

    it("rejects when secret is whitespace-only", async () => {
      const token = await signToken({ sub: "user1" });
      const result = await validateJWT(token, "   ");
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/secret.*not configured/i);
    });

    it("rejects when token is signed with a different secret", async () => {
      const token = await signToken({ sub: "user1" }, "other-secret-value-here-32chars!!");
      const result = await validateJWT(token, TEST_SECRET);
      expect(result.valid).toBe(false);
    });
  });

  describe("valid token", () => {
    it("returns valid:true and payload for a correct HS256 token", async () => {
      const token = await signToken({ sub: "user42", role: "admin" });
      const result = await validateJWT(token, TEST_SECRET);
      expect(result.valid).toBe(true);
      expect(result.payload?.sub).toBe("user42");
      expect(result.payload?.role).toBe("admin");
      expect(result.error).toBeUndefined();
    });

    it("trims whitespace from token before validation", async () => {
      const token = await signToken({ sub: "user1" });
      const result = await validateJWT(`  ${token}  `, TEST_SECRET);
      expect(result.valid).toBe(true);
    });

    it("trims whitespace from secret before validation", async () => {
      const token = await signToken({ sub: "user1" });
      const result = await validateJWT(token, `  ${TEST_SECRET}  `);
      expect(result.valid).toBe(true);
    });

    it("accepts token with no exp claim (long-lived token)", async () => {
      const token = await signToken({ sub: "user1" }, TEST_SECRET, {});
      const result = await validateJWT(token, TEST_SECRET);
      expect(result.valid).toBe(true);
    });
  });
});

describe("validateBearerToken", () => {
  describe("Authorization header validation", () => {
    it("rejects empty authorization header", async () => {
      const result = await validateBearerToken("", TEST_SECRET);
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/required/i);
    });

    it("rejects non-string authorization header", async () => {
      // @ts-expect-error intentional bad input
      const result = await validateBearerToken(null, TEST_SECRET);
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/required/i);
    });

    it("rejects header without Bearer prefix", async () => {
      const token = await signToken({ sub: "user1" });
      const result = await validateBearerToken(`Basic ${token}`, TEST_SECRET);
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/Bearer/i);
    });

    it("rejects header with empty Bearer token (trims to no space)", async () => {
      // "Bearer " trims trailing space → "Bearer" → doesn't start with "Bearer <space>"
      const result = await validateBearerToken("Bearer ", TEST_SECRET);
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/must start with/i);
    });

    it("rejects header that trims to bearer keyword only", async () => {
      // Multiple trailing spaces all get removed by trim() → same as "Bearer "
      const result = await validateBearerToken("Bearer    ", TEST_SECRET);
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/must start with/i);
    });
  });

  describe("valid Bearer token", () => {
    it("returns valid:true for a correct Bearer token", async () => {
      const token = await signToken({ sub: "user99" });
      const result = await validateBearerToken(`Bearer ${token}`, TEST_SECRET);
      expect(result.valid).toBe(true);
      expect(result.payload?.sub).toBe("user99");
    });

    it("handles extra whitespace around Bearer token", async () => {
      const token = await signToken({ sub: "user1" });
      const result = await validateBearerToken(`Bearer  ${token}`, TEST_SECRET);
      // The extra space means the token part itself is trimmed
      expect(result.valid).toBe(true);
    });
  });

  describe("invalid Bearer token contents", () => {
    it("propagates JWT validation errors from the inner token", async () => {
      const result = await validateBearerToken("Bearer not.a.valid.jwt", TEST_SECRET);
      expect(result.valid).toBe(false);
    });

    it("rejects expired Bearer token", async () => {
      const token = await signToken({ sub: "user1" }, TEST_SECRET, { expiresIn: "-1s" });
      const result = await validateBearerToken(`Bearer ${token}`, TEST_SECRET);
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/expired/i);
    });

    it("rejects Bearer token signed with wrong secret", async () => {
      const token = await signToken({ sub: "user1" }, "wrong-secret-value-here-32chars!!");
      const result = await validateBearerToken(`Bearer ${token}`, TEST_SECRET);
      expect(result.valid).toBe(false);
    });
  });
});
