/**
 * Minimal JWT validation utility for quantum-proxy.
 * Validates JWT structure, expiry, and optionally verifies HS256 signatures.
 */

const BASE64_CHUNK_SIZE = 4;
const MILLISECONDS_PER_SECOND = 1000;

interface JWTHeader {
  alg?: string;
  typ?: string;
  [key: string]: unknown;
}

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

export interface JWTValidationOptions {
  verifySignature?: boolean;
  secret?: string;
}

function restoreBase64Padding(str: string): string {
  const paddingLength = BASE64_CHUNK_SIZE - (str.length % BASE64_CHUNK_SIZE);
  if (paddingLength > 0 && paddingLength < BASE64_CHUNK_SIZE) {
    return str + "=".repeat(paddingLength);
  }
  return str;
}

/**
 * Decodes a base64url-encoded string.
 * Handles padding restoration for proper base64 decoding.
 */
function base64urlDecode(str: string): string {
  try {
    const binary = atob(restoreBase64Padding(str).replace(/-/g, "+").replace(/_/g, "/"));
    return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
  } catch {
    throw new Error("Invalid base64url encoding");
  }
}

function base64urlToBytes(str: string): Uint8Array {
  try {
    const binary = atob(restoreBase64Padding(str).replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    throw new Error("Invalid base64url encoding");
  }
}

async function verifyHS256Signature(token: string, secret: string): Promise<boolean> {
  const [headerB64, payloadB64, signatureB64] = token.split(".");
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );

  return crypto.subtle.verify(
    "HMAC",
    key,
    base64urlToBytes(signatureB64),
    encoder.encode(`${headerB64}.${payloadB64}`)
  );
}

function getSignatureSecret(options?: JWTValidationOptions): string {
  return options?.secret?.trim() || process.env.QUANTUM_JWT_SECRET?.trim() || "";
}

/**
 * Validates a JWT and optionally verifies its HS256 signature.
 *
 * Checks:
 * 1. Token has valid JWT structure (3 base64url-encoded parts separated by dots)
 * 2. Header and payload can be decoded and parsed as JSON
 * 3. Token is not expired (if exp claim exists)
 * 4. HS256 signature matches when signature verification is enabled and a secret is configured
 *
 * @param token - The raw token string (without "Bearer " prefix)
 * @returns ValidationResult with valid flag and optional error/payload
 */
export async function validateJWT(token: string, options?: JWTValidationOptions): Promise<ValidationResult> {
  if (!token || typeof token !== "string") {
    return { valid: false, error: "Token is required" };
  }

  const trimmed = token.trim();
  const parts = trimmed.split(".");
  if (parts.length !== 3) {
    return { valid: false, error: "Invalid JWT structure: expected 3 parts" };
  }

  const [headerB64, payloadB64, signatureB64] = parts;
  if (!headerB64 || !payloadB64 || !signatureB64) {
    return { valid: false, error: "Invalid JWT: empty parts" };
  }

  const signatureSecret = getSignatureSecret(options);
  const shouldVerifySignature = Boolean(options?.verifySignature && signatureSecret);

  let header: JWTHeader;
  try {
    const headerJson = base64urlDecode(headerB64);
    header = JSON.parse(headerJson) as JWTHeader;
  } catch (error) {
    return {
      valid: false,
      error: `Invalid JWT: header is not valid JSON (${error instanceof Error ? error.message : "unknown error"})`,
    };
  }

  if (shouldVerifySignature && header.alg !== "HS256") {
    return { valid: false, error: "Invalid JWT: unsupported signing algorithm" };
  }

  let payload: JWTPayload;
  try {
    const payloadJson = base64urlDecode(payloadB64);
    payload = JSON.parse(payloadJson) as JWTPayload;
  } catch (error) {
    return {
      valid: false,
      error: `Invalid JWT: payload is not valid JSON (${error instanceof Error ? error.message : "unknown error"})`,
    };
  }

  try {
    base64urlToBytes(signatureB64);
  } catch {
    return { valid: false, error: "Invalid JWT: signature is not valid base64url" };
  }

  if (payload.exp !== undefined) {
    if (typeof payload.exp !== "number") {
      return { valid: false, error: "Invalid JWT: exp claim must be a number (UNIX timestamp)" };
    }

    const now = Math.floor(Date.now() / MILLISECONDS_PER_SECOND);
    if (now >= payload.exp) {
      return { valid: false, error: "JWT token has expired" };
    }
  }

  if (shouldVerifySignature) {
    try {
      const signatureValid = await verifyHS256Signature(trimmed, signatureSecret);
      if (!signatureValid) {
        return { valid: false, error: "Invalid JWT: signature verification failed" };
      }
    } catch (error) {
      return {
        valid: false,
        error: `Invalid JWT: signature verification failed (${error instanceof Error ? error.message : "unknown error"})`,
      };
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
export async function validateBearerToken(authHeader: string, options?: JWTValidationOptions): Promise<ValidationResult> {
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

  return validateJWT(token, options);
}
