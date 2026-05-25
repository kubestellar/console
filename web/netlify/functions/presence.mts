import { getStore } from "@netlify/blobs";
import { enforceSimpleRateLimit } from "./_shared/rate-limit";

const ALLOWED_ORIGINS = [
  "https://console.kubestellar.io",
  "https://kubestellar-console.netlify.app",
  "http://localhost:5174",
  "http://localhost:8080",
];

function getCorsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }

  return headers;
}

const STORE_NAME = "presence";
const SESSION_PREFIX = "session-";
const SESSION_BUCKET_MS = 30_000;
const SESSION_TTL_MS = 90_000;
const ACTIVE_BUCKET_WINDOW = Math.ceil(SESSION_TTL_MS / SESSION_BUCKET_MS) + 1;
const CLEANUP_BUCKET_CURSOR_KEY = "cleanup-bucket-cursor";
const PRESENCE_CLEANUP_DELETE_LIMIT = 100;
const MAX_SESSION_ID_LEN = 64;
/** Maximum allowed request body size (bytes). */
const MAX_BODY_BYTES = 4_096;
const SESSION_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
const PRESENCE_WRITE_RATE_LIMIT_MAX_REQUESTS = 120;
const PRESENCE_WRITE_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const PRESENCE_READ_RATE_LIMIT_MAX_REQUESTS = 1200;
const PRESENCE_READ_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

type PresenceBlobPage = {
  blobs: Array<{ key: string; etag: string }>;
};

function isValidSessionId(sessionId: unknown): sessionId is string {
  return (
    typeof sessionId === "string" &&
    sessionId.length > 0 &&
    sessionId.length <= MAX_SESSION_ID_LEN &&
    SESSION_ID_PATTERN.test(sessionId)
  );
}

function getClientIp(req: Request): string {
  return (
    req.headers.get("x-nf-client-connection-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

function getSessionBucket(now: number): number {
  return Math.floor(now / SESSION_BUCKET_MS);
}

function getSessionBucketPrefix(bucket: number): string {
  return `${SESSION_PREFIX}${bucket}-`;
}

function buildSessionKey(sessionId: string, now: number): string {
  return `${getSessionBucketPrefix(getSessionBucket(now))}${sessionId}`;
}

function extractSessionIdFromKey(key: string): string | null {
  if (!key.startsWith(SESSION_PREFIX)) return null;

  const remainder = key.slice(SESSION_PREFIX.length);
  const separatorIndex = remainder.indexOf("-");
  if (separatorIndex === -1) return null;

  const bucket = Number.parseInt(remainder.slice(0, separatorIndex), 10);
  if (!Number.isFinite(bucket)) return null;

  const sessionId = remainder.slice(separatorIndex + 1);
  return isValidSessionId(sessionId) ? sessionId : null;
}

function jsonResponse(body: unknown, headers: Record<string, string>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

async function getFirstBlobPage(store: ReturnType<typeof getStore>, prefix: string): Promise<PresenceBlobPage> {
  const paginator = store.list({ prefix, paginate: true }) as AsyncIterable<PresenceBlobPage>;
  for await (const page of paginator) {
    return page;
  }
  return { blobs: [] };
}

async function cleanupExpiredSessionBucket(store: ReturnType<typeof getStore>, currentBucket: number): Promise<void> {
  const newestExpiredBucket = currentBucket - ACTIVE_BUCKET_WINDOW;
  if (newestExpiredBucket < 0) return;

  let cleanupBucket = newestExpiredBucket;
  try {
    const rawCursor = await store.get(CLEANUP_BUCKET_CURSOR_KEY);
    const parsedCursor = Number.parseInt(rawCursor ?? "", 10);
    if (Number.isFinite(parsedCursor)) {
      cleanupBucket = Math.min(parsedCursor, newestExpiredBucket);
    }
  } catch {
    /* ignore */
  }

  await store.set(CLEANUP_BUCKET_CURSOR_KEY, String(cleanupBucket)).catch(() => {});

  const { blobs } = await getFirstBlobPage(store, getSessionBucketPrefix(cleanupBucket));
  if (blobs.length === 0) {
    const nextCleanupBucket = Math.min(cleanupBucket + 1, newestExpiredBucket);
    await store.set(CLEANUP_BUCKET_CURSOR_KEY, String(nextCleanupBucket)).catch(() => {});
    return;
  }

  const deletes = blobs
    .slice(0, PRESENCE_CLEANUP_DELETE_LIMIT)
    .map(({ key }) => store.delete(key));
  await Promise.allSettled(deletes);
}

async function countActiveSessions(store: ReturnType<typeof getStore>, currentBucket: number): Promise<number> {
  const activeSessionIds = new Set<string>();
  const oldestActiveBucket = Math.max(0, currentBucket - ACTIVE_BUCKET_WINDOW + 1);

  for (let bucket = oldestActiveBucket; bucket <= currentBucket; bucket += 1) {
    const prefix = getSessionBucketPrefix(bucket);
    let blobs: PresenceBlobPage["blobs"] = [];

    try {
      ({ blobs } = await store.list({ prefix }));
    } catch {
      continue;
    }

    for (const blob of blobs) {
      const sessionId = extractSessionIdFromKey(blob.key);
      if (sessionId) {
        activeSessionIds.add(sessionId);
      }
    }
  }

  return activeSessionIds.size;
}

export default async (req: Request) => {
  const store = getStore(STORE_NAME);

  const origin = req.headers.get("origin");
  const headers = {
    ...getCorsHeaders(origin),
    "Cache-Control": "no-cache, no-store",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  if (req.method !== "GET" && req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, headers, 405);
  }

  const clientIp = getClientIp(req);
  const now = Date.now();

  if (req.method === "POST") {
    const rate = await enforceSimpleRateLimit({
      storeName: STORE_NAME,
      prefix: "presence-write:",
      subject: clientIp,
      maxRequests: PRESENCE_WRITE_RATE_LIMIT_MAX_REQUESTS,
      windowMs: PRESENCE_WRITE_RATE_LIMIT_WINDOW_MS,
    });
    if (rate.limited) {
      return jsonResponse(
        { error: "Rate limit exceeded", retryAfter: rate.retryAfterSeconds },
        { ...headers, "Retry-After": String(rate.retryAfterSeconds) },
        429,
      );
    }

    let sessionId: string | undefined;
    try {
      const contentLength = parseInt(req.headers.get("content-length") || "0", 10);
      if (contentLength > MAX_BODY_BYTES) {
        return new Response("Payload too large", { status: 413, headers });
      }
      const body = await req.json();
      if (isValidSessionId(body.sessionId)) {
        sessionId = body.sessionId;
      }
    } catch {
      /* ignore */
    }

    if (sessionId) {
      await store.set(buildSessionKey(sessionId, now), String(now));
    }

    return new Response(null, { status: 204, headers });
  }

  const readRate = await enforceSimpleRateLimit({
    storeName: STORE_NAME,
    prefix: "presence-read:",
    subject: clientIp,
    maxRequests: PRESENCE_READ_RATE_LIMIT_MAX_REQUESTS,
    windowMs: PRESENCE_READ_RATE_LIMIT_WINDOW_MS,
  });
  if (readRate.limited) {
    return jsonResponse(
      { error: "Rate limit exceeded", retryAfter: readRate.retryAfterSeconds },
      { ...headers, "Retry-After": String(readRate.retryAfterSeconds) },
      429,
    );
  }

  await cleanupExpiredSessionBucket(store, getSessionBucket(now)).catch(() => {});

  let count = 0;
  try {
    count = await countActiveSessions(store, getSessionBucket(now));
  } catch {
    /* ignore */
  }

  return jsonResponse({ activeUsers: count, totalConnections: count }, headers);
};
