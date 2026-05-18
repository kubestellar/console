import type { getStore } from "@netlify/blobs";
import type { ServiceAccountKey, TokenCache } from "./analytics-dashboard-types";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const JWT_EXPIRY_SECONDS = 3600;
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;
const TOKEN_CACHE_KEY = "access-token";
const MAX_LOG_BODY_CHARS = 500;

function sanitizeUpstreamError(text: string): string {
  const oneLine = text.replace(/[\r\n]+/g, " ").trim();
  return oneLine.length > MAX_LOG_BODY_CHARS
    ? oneLine.slice(0, MAX_LOG_BODY_CHARS) + "…[truncated]"
    : oneLine;
}

function base64url(data: Uint8Array): string {
  return btoa(String.fromCharCode(...data))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function textToBase64url(text: string): string {
  return base64url(new TextEncoder().encode(text));
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const pemContents = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\n/g, "");
  const binaryDer = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));

  return crypto.subtle.importKey(
    "pkcs8",
    binaryDer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

async function createSignedJWT(serviceAccount: ServiceAccountKey): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: serviceAccount.client_email,
    sub: serviceAccount.client_email,
    aud: GOOGLE_TOKEN_URL,
    iat: now,
    exp: now + JWT_EXPIRY_SECONDS,
    scope: "https://www.googleapis.com/auth/analytics.readonly",
  };

  const headerB64 = textToBase64url(JSON.stringify(header));
  const payloadB64 = textToBase64url(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;

  const key = await importPrivateKey(serviceAccount.private_key);
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingInput)
  );

  return `${signingInput}.${base64url(new Uint8Array(signature))}`;
}

export async function getAccessToken(
  serviceAccount: ServiceAccountKey,
  store: ReturnType<typeof getStore>
): Promise<string> {
  try {
    const cached = await store.get(TOKEN_CACHE_KEY, { type: "text" });
    if (cached) {
      const entry: TokenCache = JSON.parse(cached);
      if (Date.now() < entry.expiresAt - TOKEN_REFRESH_BUFFER_MS) {
        return entry.accessToken;
      }
    }
  } catch {
    // Cache miss
  }

  const jwt = await createSignedJWT(serviceAccount);
  const resp = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!resp.ok) {
    const body = await resp.text();
    const reqId = Date.now();
    console.error(`[analytics-dashboard] token exchange failed (req=${reqId}): HTTP ${resp.status} — ${sanitizeUpstreamError(body)}`);
    throw new Error(`Upstream service error (req=${reqId})`);
  }

  const data = await resp.json();
  const accessToken = data.access_token;
  const expiresIn = data.expires_in || JWT_EXPIRY_SECONDS;

  const cacheEntry: TokenCache = {
    accessToken,
    expiresAt: Date.now() + expiresIn * 1000,
  };
  store.set(TOKEN_CACHE_KEY, JSON.stringify(cacheEntry)).catch((err) => {
    console.warn("[analytics-dashboard] blob cache write failed:", err instanceof Error ? err.message : err);
  });

  return accessToken;
}
