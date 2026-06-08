/**
 * Netlify Function: Bonus Points
 *
 * Returns bonus points for a given GitHub login by scanning [bonus] issues
 * on kubestellar/console with the "bonus-points" label created by clubanderson.
 *
 * Matches the logic in kubestellar/docs scripts/generate-leaderboard.mjs.
 *
 * Query: GET /api/rewards/bonus?login=rishi-jat
 */

import { getStore } from "@netlify/blobs";
import { buildCorsHeaders, handlePreflight } from "./_shared";
import { enforceSimpleRateLimit } from "./_shared/rate-limit";

const BONUS_REPO = "kubestellar/console";
const BONUS_LABEL = "bonus-points";
const BONUS_AUTHORIZED_USER = "clubanderson";
const BONUS_TITLE_REGEX = /^\[bonus\]\s+@(\S+)\s+\+(\d+)\s*(.*)/i;

/** GitHub username validation — alphanumeric, hyphens allowed, 1-39 chars (#14500) */
const GITHUB_LOGIN_REGEX = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,38})?$/;

/** Blob cache store name */
const CACHE_STORE_NAME = "bonus-points-cache";
/** Cache key for all bonus issues */
const CACHE_KEY = "all-bonus-issues";
/** Cache TTL — 15 minutes */
const CACHE_TTL_MS = 15 * 60 * 1000;

/** Rate limit store and config */
const RATE_LIMIT_STORE_NAME = "bonus-points-rate-limit";
const RATE_LIMIT_MAX_REQUESTS = 30;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

/** Timeout for GitHub API requests */
const GITHUB_API_TIMEOUT_MS = 10_000;
/** Maximum response body size (512 KB) */
const MAX_RESPONSE_BYTES = 512_000;

interface BonusEntry {
  issue_number: number;
  points: number;
  reason: string;
  created_at: string;
  state: string;
}

interface BlobCacheEntry {
  byLogin: Record<string, BonusEntry[]>;
  fetchedAt: number;
}

async function readCappedJson<T>(response: Response): Promise<T> {
  const contentLength = parseInt(response.headers.get("content-length") || "0", 10);
  if (contentLength > MAX_RESPONSE_BYTES) {
    throw new Error(`Response too large: ${contentLength} bytes exceeds ${MAX_RESPONSE_BYTES}`);
  }

  const rawText = await response.text();
  if (rawText.length > MAX_RESPONSE_BYTES) {
    throw new Error(`Response too large: ${rawText.length} bytes exceeds ${MAX_RESPONSE_BYTES}`);
  }

  return JSON.parse(rawText) as T;
}

async function fetchAllBonusIssues(): Promise<Record<string, BonusEntry[]>> {
  const byLogin: Record<string, BonusEntry[]> = {};

  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const url = `https://api.github.com/repos/${BONUS_REPO}/issues?labels=${BONUS_LABEL}&state=all&per_page=100&creator=${BONUS_AUTHORIZED_USER}`;
  const res = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(GITHUB_API_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`GitHub API ${res.status}`);
  }

  const issues = await readCappedJson<Array<{
    number: number;
    title: string;
    user: { login: string };
    created_at: string;
    state: string;
  }>>(res);

  for (const issue of issues) {
    if (issue.user?.login !== BONUS_AUTHORIZED_USER) continue;

    const match = issue.title.match(BONUS_TITLE_REGEX);
    if (!match) continue;

    const [, login, pointsStr, reason] = match;
    const points = parseInt(pointsStr, 10);
    if (isNaN(points) || points <= 0) continue;

    if (!byLogin[login]) byLogin[login] = [];
    byLogin[login].push({
      issue_number: issue.number,
      points,
      reason: reason.trim() || "(no reason)",
      created_at: issue.created_at,
      state: issue.state,
    });
  }

  return byLogin;
}

async function readBlobCache(): Promise<Record<string, BonusEntry[]> | null> {
  try {
    const store = getStore(CACHE_STORE_NAME);
    const raw = await store.get(CACHE_KEY, { type: "json" }) as BlobCacheEntry | null;
    if (raw && raw.fetchedAt && Date.now() - raw.fetchedAt < CACHE_TTL_MS) {
      return raw.byLogin;
    }
  } catch {
    // cache miss — proceed to fetch
  }
  return null;
}

async function writeBlobCache(byLogin: Record<string, BonusEntry[]>): Promise<void> {
  try {
    const store = getStore(CACHE_STORE_NAME);
    const entry: BlobCacheEntry = { byLogin, fetchedAt: Date.now() };
    await store.setJSON(CACHE_KEY, entry);
  } catch {
    // best-effort
  }
}

export default async (req: Request) => {
  const headers: Record<string, string> = {
    ...buildCorsHeaders(req, { methods: "GET, OPTIONS" }),
    "Content-Type": "application/json",
    "Cache-Control": "public, max-age=900",
  };

  if (req.method === "OPTIONS") {
    return handlePreflight(req, { methods: "GET, OPTIONS" });
  }

  const clientIp =
    req.headers.get("x-nf-client-connection-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";

  const rate = await enforceSimpleRateLimit({
    storeName: RATE_LIMIT_STORE_NAME,
    prefix: "bonus-points:",
    subject: clientIp,
    maxRequests: RATE_LIMIT_MAX_REQUESTS,
    windowMs: RATE_LIMIT_WINDOW_MS,
  });
  if (rate.limited) {
    return new Response(
      JSON.stringify({ error: "Rate limit exceeded" }),
      {
        status: 429,
        headers: {
          ...headers,
          "Retry-After": String(rate.retryAfterSeconds),
          "Cache-Control": "no-store",
        },
      }
    );
  }

  const url = new URL(req.url);
  const login = url.searchParams.get("login");

  if (!login) {
    return new Response(
      JSON.stringify({ error: "Missing ?login= parameter" }),
      { status: 400, headers }
    );
  }

  if (!GITHUB_LOGIN_REGEX.test(login)) {
    return new Response(
      JSON.stringify({ error: "Invalid GitHub username format" }),
      { status: 400, headers }
    );
  }

  try {
    // Try Netlify Blobs cache first (persists across Lambda containers)
    let byLogin = await readBlobCache();
    if (!byLogin) {
      byLogin = await fetchAllBonusIssues();
      writeBlobCache(byLogin).catch((err) => {
        console.warn("[bonus-points] blob cache write failed:", err instanceof Error ? err.message : err);
      });
    }

    const entries = byLogin[login] || [];
    const totalPoints = entries.reduce((sum, e) => sum + e.points, 0);

    return new Response(
      JSON.stringify({
        login,
        total_bonus_points: totalPoints,
        entries,
      }),
      { status: 200, headers }
    );
  } catch (err) {
    console.error("Failed to fetch bonus points:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 502, headers }
    );
  }
};

export const config = {
  path: "/api/rewards/bonus",
};

/** @internal */
export const _testOnly = {
  MAX_RESPONSE_BYTES,
  GITHUB_LOGIN_REGEX,
  CACHE_TTL_MS,
};
