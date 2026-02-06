import { getStore } from "@netlify/blobs";

interface Sessions {
  [sessionId: string]: number; // timestamp of last heartbeat
}

const STORE_NAME = "presence";
const BLOB_KEY = "sessions";
const SESSION_TTL_MS = 90_000; // 90 seconds — sessions expire if no heartbeat
const MAX_RETRIES = 5; // Max retries for optimistic locking

export default async (req: Request) => {
  const store = getStore(STORE_NAME, { consistency: "strong" });

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
  const cutoff = now - SESSION_TTL_MS;
  let sessionId: string | null = null;

  // Parse POST body for session ID
  if (req.method === "POST") {
    try {
      const body = await req.json();
      if (typeof body.sessionId === "string" && body.sessionId.length > 0) {
        sessionId = body.sessionId;
      }
    } catch {
      // Ignore malformed bodies
    }
  }

  // Optimistic locking with retry
  let sessions: Sessions = {};
  let success = false;
  let retries = 0;

  while (!success && retries < MAX_RETRIES) {
    retries++;

    // Read current state with metadata (etag)
    let currentEtag: string | undefined;
    try {
      const result = await store.getWithMetadata(BLOB_KEY);
      if (result && result.data) {
        sessions = JSON.parse(result.data);
        currentEtag = result.etag;
      } else {
        sessions = {};
      }
    } catch {
      sessions = {};
    }

    // Add/update session if POST
    if (sessionId) {
      sessions[sessionId] = now;
    }

    // Prune expired sessions
    for (const [id, ts] of Object.entries(sessions)) {
      if (ts < cutoff) delete sessions[id];
    }

    // Write updated sessions
    try {
      await store.set(BLOB_KEY, JSON.stringify(sessions));

      // Verify our write succeeded by checking if data contains our session
      if (sessionId) {
        const verify = await store.get(BLOB_KEY);
        if (verify) {
          const verifyData = JSON.parse(verify);
          if (verifyData[sessionId] === now) {
            success = true;
          }
          // Update sessions from verification read for accurate count
          sessions = verifyData;
        }
      } else {
        // GET request - just read once more for freshest count
        const verify = await store.get(BLOB_KEY);
        if (verify) sessions = JSON.parse(verify);
        success = true;
      }
    } catch {
      // Write failed, will retry
    }

    // Small random delay before retry to reduce collision
    if (!success && retries < MAX_RETRIES) {
      await new Promise(r => setTimeout(r, 50 + Math.random() * 100));
    }
  }

  // Prune again with fresh data
  for (const [id, ts] of Object.entries(sessions)) {
    if (ts < cutoff) delete sessions[id];
  }

  const count = Object.keys(sessions).length;

  return new Response(
    JSON.stringify({ activeUsers: count, totalConnections: count }),
    { status: 200, headers: { ...headers, "Content-Type": "application/json" } }
  );
};
