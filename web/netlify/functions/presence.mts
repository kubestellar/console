import { getStore } from "@netlify/blobs";

interface Sessions {
  [sessionId: string]: number; // timestamp of last heartbeat
}

const STORE_NAME = "presence";
const BLOB_KEY = "sessions";
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

  // Read current sessions from blob store
  let sessions: Sessions = {};
  try {
    const raw = await store.get(BLOB_KEY);
    if (raw) sessions = JSON.parse(raw);
  } catch {
    sessions = {};
  }

  const now = Date.now();

  // POST = heartbeat (register or refresh a session)
  if (req.method === "POST") {
    try {
      const body = await req.json();
      const sessionId = body.sessionId;
      if (typeof sessionId === "string" && sessionId.length > 0) {
        sessions[sessionId] = now;
      }
    } catch {
      // Ignore malformed bodies
    }
  }

  // Prune expired sessions
  const cutoff = now - SESSION_TTL_MS;
  for (const [id, ts] of Object.entries(sessions)) {
    if (ts < cutoff) delete sessions[id];
  }

  // Persist updated sessions
  try {
    await store.set(BLOB_KEY, JSON.stringify(sessions));
  } catch {
    // Best-effort write — don't fail the response
  }

  const count = Object.keys(sessions).length;

  return new Response(
    JSON.stringify({ activeUsers: count, totalConnections: count }),
    { status: 200, headers: { ...headers, "Content-Type": "application/json" } }
  );
};
