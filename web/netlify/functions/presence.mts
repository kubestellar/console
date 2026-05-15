import { getStore } from "@netlify/blobs";
import { enforceSimpleRateLimit } from "./_shared/rate-limit";

const ALLOWED_HOSTS = new Set([
  "console.kubestellar.io",
  "localhost",
  "127.0.0.1",
]);

function getAllowedCorsOrigin(origin: string): string {
  if (!origin) return "https://console.kubestellar.io";
  try {
    const hostname = new URL(origin).hostname;
    if (ALLOWED_HOSTS.has(hostname) || hostname.endsWith(".netlify.app")) {
      return origin;
    }
  } catch {
    /* ignore */
  }
  return "https://console.kubestellar.io";
}

const STORE_NAME = "presence";
const SESSION_PREFIX = "session-";
const SESSION_TTL_MS = 90_000; // 90 seconds — sessions expire if no heartbeat
const MAX_SESSION_ID_LEN = 64;
const SESSION_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
const PRESENCE_RATE_LIMIT_MAX_REQUESTS = 120;
const PRESENCE_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

function isValidSessionId(sessionId: unknown): sessionId is string {
  return (
    typeof sessionId === "string" &&
    sessionId.length > 0 &&
    sessionId.length <= MAX_SESSION_ID_LEN &&
    SESSION_ID_PATTERN.test(sessionId)
  );
}

export default async (req: Request) => {
  const store = getStore(STORE_NAME);

  // CORS headers — restrict to allowed origins (production + preview deploys)
  const origin = req.headers.get("origin") || "";
  const corsOrigin = getAllowedCorsOrigin(origin);
  const headers = {
    "Access-Control-Allow-Origin": corsOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-cache, no-store",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  const now = Date.now();

  // POST = heartbeat (register or refresh a session)
  // Each session gets its own blob key — no read-modify-write race
  if (req.method === "POST") {
    let sessionId: string | undefined;
    try {
      const body = await req.json();
      if (isValidSessionId(body.sessionId)) {
        sessionId = body.sessionId;
      }
    } catch {
      // Ignore malformed bodies
    }

    const clientIp =
      req.headers.get("x-nf-client-connection-ip") ??
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      "unknown";
    const rate = await enforceSimpleRateLimit({
      storeName: STORE_NAME,
      prefix: "presence:",
      subject: sessionId ?? clientIp,
      maxRequests: PRESENCE_RATE_LIMIT_MAX_REQUESTS,
      windowMs: PRESENCE_RATE_LIMIT_WINDOW_MS,
    });
    if (rate.limited) {
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded", retryAfter: rate.retryAfterSeconds }),
        { status: 429, headers: { ...headers, "Content-Type": "application/json" } }
      );
    }

    if (sessionId) {
      await store.set(`${SESSION_PREFIX}${sessionId}`, String(now));
    }
  }

  // Count active sessions by listing all session blobs
  let count = 0;
  try {
    const { blobs } = await store.list({ prefix: SESSION_PREFIX });
    const cutoff = now - SESSION_TTL_MS;

    // Check each session blob and prune expired ones
    const checks = blobs.map(async (blob) => {
      try {
        const raw = await store.get(blob.key);
        if (!raw) return false;
        const ts = parseInt(raw, 10);
        if (ts < cutoff) {
          // Expired — clean up in background (best-effort)
          store.delete(blob.key).catch((err) => { console.warn("[presence] blob delete failed:", err instanceof Error ? err.message : err) });
          return false;
        }
        return true;
      } catch {
        return false;
      }
    });

    const results = await Promise.all(checks);
    count = results.filter(Boolean).length;
  } catch {
    // If list fails, return 0 rather than error
  }

  return new Response(
    JSON.stringify({ activeUsers: count, totalConnections: count }),
    { status: 200, headers: { ...headers, "Content-Type": "application/json" } }
  );
};
