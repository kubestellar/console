/**
 * Minimal JWT validation utility for quantum-proxy.
 * Validates JWT structure, expiry, and basic claims.
 * Does NOT perform signature verification (would require the issuer's public key).
 */

export interface JWTPayload {
  exp?: number;
  iss?: string;
  sub?: string;
  aud?: string | string[];
  [key: string]: unknown;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
  payload?: JWTPayload;
}

/**
 * Decodes a base64url-encoded string.
 * Handles padding restoration for proper base64 decoding.
 */
function base64urlDecode(str: string): string {
  try {
    // Add padding if necessary
    const paddingLength = 4 - (str.length % 4);
    let padded = str;
    if (paddingLength > 0 && paddingLength < 4) {
      padded = str + "=".repeat(paddingLength);
    }
    // Convert base64url to standard base64
    const base64 = padded.replace(/-/g, "+").replace(/_/g, "/");
    // Decode and convert to string
    const binary = atob(base64);
    return new TextDecoder().decode(
      Uint8Array.from(binary, (c) => c.charCodeAt(0))
    );
  } catch {
    throw new Error("Invalid base64url encoding");
  }
}

/**
 * Validates a Bearer token (JWT) without signature verification.
 *
 * Checks:
 * 1. Token has valid JWT structure (3 base64url-encoded parts separated by dots)
 * 2. Payload can be decoded and parsed as JSON
 * 3. Token is not expired (if exp claim exists)
 *
 * @param token - The raw token string (without "Bearer " prefix)
 * @returns ValidationResult with valid flag and optional error/payload
 */
export function validateJWT(token: string): ValidationResult {
  if (!token || typeof token !== "string") {
    return { valid: false, error: "Token is required" };
  }

  const trimmed = token.trim();

  // Check JWT structure: must have 3 parts separated by dots
  const parts = trimmed.split(".");
  if (parts.length !== 3) {
    return { valid: false, error: "Invalid JWT structure: expected 3 parts" };
  }

  const [headerB64, payloadB64, signatureB64] = parts;

  // Validate that all parts are non-empty
  if (!headerB64 || !payloadB64 || !signatureB64) {
    return { valid: false, error: "Invalid JWT: empty parts" };
  }

  // Attempt to decode header (basic validation that it's base64url)
  try {
    base64urlDecode(headerB64);
  } catch {
    return { valid: false, error: "Invalid JWT: header is not valid base64url" };
  }

  // Decode and validate payload
  let payload: JWTPayload;
  try {
    const payloadJson = base64urlDecode(payloadB64);
    payload = JSON.parse(payloadJson) as JWTPayload;
  } catch (e) {
    return {
      valid: false,
      error: `Invalid JWT: payload is not valid JSON (${e instanceof Error ? e.message : "unknown error"})`,
    };
  }

  // Validate signature part is base64url (just structure, not cryptographic verification)
  try {
    base64urlDecode(signatureB64);
  } catch {
    return { valid: false, error: "Invalid JWT: signature is not valid base64url" };
  }

  // Check expiry if exp claim exists
  if (payload.exp !== undefined) {
    if (typeof payload.exp !== "number") {
      return { valid: false, error: "Invalid JWT: exp claim must be a number (UNIX timestamp)" };
    }

    const now = Math.floor(Date.now() / 1000);
    if (now >= payload.exp) {
      return { valid: false, error: "JWT token has expired" };
    }
  }

  return { valid: true, payload };
}

/**
 * Extracts and validates a Bearer token from an Authorization header.
 *
 * @param authHeader - The Authorization header value (e.g., "Bearer eyJ...")
 * @returns ValidationResult
 */
export function validateBearerToken(authHeader: string): ValidationResult {
  if (!authHeader || typeof authHeader !== "string") {
    return { valid: false, error: "Authorization header is required" };
  }

  const trimmed = authHeader.trim();
  const bearerPrefix = "Bearer ";

  if (!trimmed.startsWith(bearerPrefix)) {
    return { valid: false, error: "Authorization header must start with 'Bearer '" };
  }

  const token = trimmed.slice(bearerPrefix.length);

  if (!token) {
    return { valid: false, error: "Bearer token is empty" };
  }

  return validateJWT(token);
}
