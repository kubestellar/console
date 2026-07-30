import { jwtVerify, type JWTPayload as JoseJWTPayload } from "jose";

const JWT_PART_COUNT = 3;
const JWT_HMAC_ALGORITHM = "HS256";
const JWT_NONE_ALGORITHM = "none";
const MISSING_JWT_SECRET_ERROR =
  "JWT verification secret is not configured; set JWT_SECRET or VITE_JWT_SECRET.";

interface JWTHeader {
  alg?: unknown;
  [key: string]: unknown;
}

export interface JWTPayload extends JoseJWTPayload {
  [key: string]: unknown;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
  payload?: JWTPayload;
}

function decodeBase64(base64: string): string {
  if (typeof atob === "function") {
    return atob(base64);
  }
  return Buffer.from(base64, "base64").toString("binary");
}

function base64urlDecode(str: string): string {
  try {
    const paddingLength = 4 - (str.length % 4);
    let padded = str;
    if (paddingLength > 0 && paddingLength < 4) {
      padded = str + "=".repeat(paddingLength);
    }
    const base64 = padded.replace(/-/g, "+").replace(/_/g, "/");
    const binary = decodeBase64(base64);
    return new TextDecoder().decode(
      Uint8Array.from(binary, (character) => character.charCodeAt(0))
    );
  } catch {
    throw new Error("Invalid base64url encoding");
  }
}

function validateStructureAndExpiry(token: string): ValidationResult {
  if (!token || typeof token !== "string") {
    return { valid: false, error: "Token is required" };
  }

  const trimmed = token.trim();
  const parts = trimmed.split(".");
  if (parts.length !== JWT_PART_COUNT) {
    return { valid: false, error: "Invalid JWT structure: expected 3 parts" };
  }

  const [headerB64, payloadB64, signatureB64] = parts;
  if (!headerB64 || !payloadB64) {
    return { valid: false, error: "Invalid JWT: empty header or payload" };
  }

  let header: JWTHeader;
  try {
    const headerJson = base64urlDecode(headerB64);
    header = JSON.parse(headerJson) as JWTHeader;
  } catch {
    return { valid: false, error: "Invalid JWT: header is not valid JSON" };
  }

  if (typeof header.alg !== "string") {
    return { valid: false, error: "Invalid JWT: alg header must be a string" };
  }

  if (header.alg === JWT_NONE_ALGORITHM) {
    return { valid: false, error: 'Invalid JWT: unsigned tokens (alg "none") are not allowed' };
  }

  if (header.alg !== JWT_HMAC_ALGORITHM) {
    return { valid: false, error: `Invalid JWT: unsupported alg ${header.alg}` };
  }

  if (!signatureB64) {
    return { valid: false, error: "Invalid JWT: signature is required" };
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
    base64urlDecode(signatureB64);
  } catch {
    return { valid: false, error: "Invalid JWT: signature is not valid base64url" };
  }

  if (payload.exp !== undefined) {
    if (typeof payload.exp !== "number") {
      return {
        valid: false,
        error: "Invalid JWT: exp claim must be a number (UNIX timestamp)",
      };
    }

    const now = Math.floor(Date.now() / 1000);
    if (now >= payload.exp) {
      return { valid: false, error: "JWT token has expired" };
    }
  }

  return { valid: true, payload };
}

export async function validateJWT(
  token: string,
  jwtSecret?: string,
): Promise<ValidationResult> {
  const structuralValidation = validateStructureAndExpiry(token);
  if (!structuralValidation.valid) {
    return structuralValidation;
  }

  const normalizedSecret = jwtSecret?.trim();
  if (!normalizedSecret) {
    return {
      valid: false,
      error: MISSING_JWT_SECRET_ERROR,
    };
  }

  try {
    const secretKey = new TextEncoder().encode(normalizedSecret);
    const verified = await jwtVerify(token.trim(), secretKey, {
      algorithms: [JWT_HMAC_ALGORITHM],
    });

    return {
      valid: true,
      payload: verified.payload as JWTPayload,
    };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : "JWT signature verification failed",
    };
  }
}

export async function validateBearerToken(
  authHeader: string,
  jwtSecret?: string,
): Promise<ValidationResult> {
  if (!authHeader || typeof authHeader !== "string") {
    return { valid: false, error: "Authorization header is required" };
  }

  const trimmed = authHeader.trimStart();
  const bearerPrefix = "Bearer ";

  if (!trimmed.startsWith(bearerPrefix)) {
    return {
      valid: false,
      error: "Authorization header must start with 'Bearer '",
    };
  }

  const token = trimmed.slice(bearerPrefix.length).trim();
  if (!token) {
    return { valid: false, error: "Bearer token is empty" };
  }

  return validateJWT(token, jwtSecret);
}
