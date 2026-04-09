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

const BONUS_REPO = "kubestellar/console";
const BONUS_LABEL = "bonus-points";
const BONUS_AUTHORIZED_USER = "clubanderson";
const BONUS_TITLE_REGEX = /^\[bonus\]\s+@(\S+)\s+\+(\d+)\s*(.*)/i;

/** Cache TTL — 15 minutes */
const CACHE_TTL_MS = 15 * 60 * 1000;

interface BonusEntry {
  issue_number: number;
  points: number;
  reason: string;
  created_at: string;
  state: string;
}

interface CachedBonusData {
  /** Map of login -> entries */
  byLogin: Record<string, BonusEntry[]>;
  fetchedAt: number;
}

let cache: CachedBonusData | null = null;

const ALLOWED_ORIGINS = [
  "https://console.kubestellar.io",
  "https://kubestellar.io",
];

function corsOrigin(origin: string | null): string {
  if (!origin) return ALLOWED_ORIGINS[0];
  if (ALLOWED_ORIGINS.some((o) => origin === o) || origin.endsWith(".kubestellar.io")) {
    return origin;
  }
  return ALLOWED_ORIGINS[0];
}

async function fetchAllBonusIssues(): Promise<Record<string, BonusEntry[]>> {
  const byLogin: Record<string, BonusEntry[]> = {};

  // Use GitHub API without auth — bonus-points issues are public
  // Fall back to GITHUB_TOKEN if available for higher rate limits
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const url = `https://api.github.com/repos/${BONUS_REPO}/issues?labels=${BONUS_LABEL}&state=all&per_page=100&creator=${BONUS_AUTHORIZED_USER}`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`GitHub API ${res.status}`);
  }

  const issues = await res.json();

  for (const issue of issues as Array<{ number: number; title: string; user: { login: string }; created_at: string; state: string }>) {
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

export default async (req: Request) => {
  const origin = req.headers.get("origin");
  const headers: Record<string, string> = {
    "Access-Control-Allow-Origin": corsOrigin(origin),
    "Content-Type": "application/json",
    "Cache-Control": "public, max-age=900",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: { ...headers, "Access-Control-Allow-Methods": "GET, OPTIONS" },
    });
  }

  const url = new URL(req.url);
  const login = url.searchParams.get("login");

  if (!login) {
    return new Response(
      JSON.stringify({ error: "Missing ?login= parameter" }),
      { status: 400, headers }
    );
  }

  try {
    // Check cache
    if (!cache || Date.now() - cache.fetchedAt > CACHE_TTL_MS) {
      const byLogin = await fetchAllBonusIssues();
      cache = { byLogin, fetchedAt: Date.now() };
    }

    const entries = cache.byLogin[login] || [];
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
    return new Response(
      JSON.stringify({ error: "Failed to fetch bonus points", detail: String(err) }),
      { status: 502, headers }
    );
  }
};

export const config = {
  path: "/api/rewards/bonus",
};
