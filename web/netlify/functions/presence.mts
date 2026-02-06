import { getStore } from "@netlify/blobs";

const STORE_NAME = "presence";
const SESSION_PREFIX = "session-";
const SESSION_TTL_MS = 90_000; // 90 seconds — sessions expire if no heartbeat

export default async (req: Request) => {
  const store = getStore(STORE_NAME);

  // CORS headers for cross-origin requests (preview deploys)
  const headers = {
    "Access-Control-Allow-Origin": "*",
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
    try {
      const body = await req.json();
      const sessionId = body.sessionId;
      if (typeof sessionId === "string" && sessionId.length > 0) {
        await store.set(`${SESSION_PREFIX}${sessionId}`, String(now));
      }
    } catch {
      // Ignore malformed bodies
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
          store.delete(blob.key).catch(() => {});
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
