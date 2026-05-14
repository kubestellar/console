/**
 * Netlify Function: NPS (Net Promoter Score)
 *
 * Collects and serves NPS survey responses independent of GA4 analytics.
 * This runs even when users have opted out of analytics — NPS is voluntary
 * product feedback, not passive tracking.
 *
 * POST /api/nps — submit a response
 * GET  /api/nps — retrieve aggregate results + trend data
 *
 * Storage: Netlify Blobs (serverless KV store, no setup required)
 */

import { getStore } from "@netlify/blobs";

// ── Types ────────────────────────────────────────────────────────────

/**
 * The frontend widget uses a 4-emoji scale (1=sad, 2=meh, 3=good, 4=love).
 * We store the raw 1-4 score and bucket into classic NPS categories:
 *   1     → detractor
 *   2, 3  → passive
 *   4     → promoter
 */
interface NPSResponse {
  score: number; // 1-4
  category: "promoter" | "passive" | "detractor";
  feedback?: string;
  timestamp: string;
  /** Anonymous session hash — no PII */
  sessionId?: string;
}

interface NPSData {
  responses: NPSResponse[];
}

interface NPSAggregation {
  totalResponses: number;
  npsScore: number; // -100 to 100
  promoters: number;
  passives: number;
  detractors: number;
  promoterPct: number;
  passivePct: number;
  detractorPct: number;
  /** Average score (1-4) */
  averageScore: number;
  /** Maximum possible score — lets the dashboard render "X / MAX" without hardcoding */
  scoreMax: number;
  /** Monthly trend: { month: "2026-04", npsScore, count } */
  trend: Array<{ month: string; npsScore: number; count: number; avgScore: number }>;
  /** Recent responses (last 20, no PII) */
  recent: Array<{ score: number; category: string; feedback?: string; timestamp: string }>;
}

// ── Constants ────────────────────────────────────────────────────────

const STORE_NAME = "nps-responses";
const DATA_KEY = "all-responses";
/** Maximum responses to store (rolling window) */
const MAX_RESPONSES = 1000;
/** Maximum feedback text length */
const MAX_FEEDBACK_LENGTH = 500;
/** Recent responses to include in GET response */
const RECENT_COUNT = 20;
/** Minimum valid score (1 = sad emoji) */
const SCORE_MIN = 1;
/** Maximum valid score (4 = love emoji) */
const SCORE_MAX = 4;
/** Threshold at/above which a response is a promoter */
const PROMOTER_MIN = 4;
/** Threshold at/above which a response is a passive (else detractor) */
const PASSIVE_MIN = 2;
/** Rate limit: one NPS submission per IP per 24 hours */
const RATE_LIMIT_MS = 24 * 60 * 60 * 1000;
/** Key prefix for per-IP rate limiting */
const RATE_KEY_PREFIX = "nps-rate-";

const ALLOWED_ORIGINS = [
  "https://console.kubestellar.io",
  "https://kubestellar.io",
  "https://www.kubestellar.io",
];

/**
 * Returns a CORS origin header value for the given request origin.
 * Uses parsed-hostname checks — not raw string includes/startsWith/endsWith —
 * to prevent bypass via crafted origins (CodeQL #9119).
 */
function corsOrigin(origin: string | null): string {
  if (!origin) return ALLOWED_ORIGINS[0];
  if (ALLOWED_ORIGINS.includes(origin)) return origin;
  try {
    const parsed = new URL(origin);
    const host = parsed.hostname.toLowerCase();
    // Allow any subdomain of kubestellar.io
    if (host === "kubestellar.io" || host.endsWith(".kubestellar.io")) return origin;
    // Allow localhost for development (any port) — protocol must be http: exactly
    if (parsed.protocol === "http:" && host === "localhost") return origin;
  } catch {
    // Malformed origin — fall through to default
  }
  return ALLOWED_ORIGINS[0];
}

function categorize(score: number): "promoter" | "passive" | "detractor" {
  if (score >= PROMOTER_MIN) return "promoter";
  if (score >= PASSIVE_MIN) return "passive";
  return "detractor";
}

function computeAggregation(data: NPSData): NPSAggregation {
  // Re-derive category from raw score on every read so historical rows
  // that were bucketed under the old 0-10 thresholds get corrected in the
  // aggregation without needing a storage migration.
  const responses: NPSResponse[] = data.responses.map((r) => ({
    ...r,
    category: categorize(r.score),
  }));
  const total = responses.length;

  if (total === 0) {
    return {
      totalResponses: 0,
      npsScore: 0,
      promoters: 0,
      passives: 0,
      detractors: 0,
      promoterPct: 0,
      passivePct: 0,
      detractorPct: 0,
      averageScore: 0,
      scoreMax: SCORE_MAX,
      trend: [],
      recent: [],
    };
  }

  const promoters = responses.filter((r) => r.category === "promoter").length;
  const passives = responses.filter((r) => r.category === "passive").length;
  const detractors = responses.filter((r) => r.category === "detractor").length;
  const npsScore = Math.round(((promoters - detractors) / total) * 100);
  const averageScore = responses.reduce((sum, r) => sum + r.score, 0) / total;

  // Monthly trend
  const byMonth = new Map<string, NPSResponse[]>();
  for (const r of responses) {
    const month = r.timestamp.slice(0, 7); // "2026-04"
    if (!byMonth.has(month)) byMonth.set(month, []);
    byMonth.get(month)!.push(r);
  }

  const trend = [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, monthResponses]) => {
      const p = monthResponses.filter((r) => r.category === "promoter").length;
      const d = monthResponses.filter((r) => r.category === "detractor").length;
      const count = monthResponses.length;
      const monthNps = Math.round(((p - d) / count) * 100);
      const avgScore = monthResponses.reduce((sum, r) => sum + r.score, 0) / count;
      return { month, npsScore: monthNps, count, avgScore: Math.round(avgScore * 10) / 10 };
    });

  // Recent responses (strip sessionId for privacy)
  const recent = responses
    .slice(-RECENT_COUNT)
    .reverse()
    .map(({ score, category, feedback, timestamp }) => ({
      score,
      category,
      ...(feedback ? { feedback } : {}),
      timestamp,
    }));

  return {
    totalResponses: total,
    npsScore,
    promoters,
    passives,
    detractors,
    promoterPct: Math.round((promoters / total) * 100),
    passivePct: Math.round((passives / total) * 100),
    detractorPct: Math.round((detractors / total) * 100),
    averageScore: Math.round(averageScore * 10) / 10,
    scoreMax: SCORE_MAX,
    trend,
    recent,
  };
}

// ── Handler ──────────────────────────────────────────────────────────

export default async (req: Request) => {
  const origin = req.headers.get("origin");
  const headers: Record<string, string> = {
    "Access-Control-Allow-Origin": corsOrigin(origin),
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  const store = getStore(STORE_NAME);

  // ── GET: return aggregated results ──
  if (req.method === "GET") {
    try {
      const raw = await store.get(DATA_KEY);
      const data: NPSData = raw ? JSON.parse(raw) : { responses: [] };
      const aggregation = computeAggregation(data);
      return new Response(JSON.stringify(aggregation), {
        status: 200,
        headers: { ...headers, "Cache-Control": "public, max-age=300" },
      });
    } catch (err) {
      console.error("Failed to load NPS data:", err);
      return new Response(
        JSON.stringify({ error: "Internal server error" }),
        { status: 500, headers }
      );
    }
  }

  // ── POST: submit a response ──
  if (req.method === "POST") {
    try {
      // Per-IP rate limiting — 1 submission per 24h
      const clientIp =
        req.headers.get("x-nf-client-connection-ip") ??
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        "unknown";
      const rateKey = `${RATE_KEY_PREFIX}${clientIp}`;
      const lastSubmit = await store.get(rateKey);
      if (lastSubmit && Date.now() - parseInt(lastSubmit, 10) < RATE_LIMIT_MS) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded — one submission per 24 hours" }),
          { status: 429, headers }
        );
      }

      const body = await req.json();
      const score = parseInt(body.score, 10);

      // Validate — 4-emoji widget uses scores 1-4
      if (isNaN(score) || score < SCORE_MIN || score > SCORE_MAX) {
        return new Response(
          JSON.stringify({ error: `Score must be ${SCORE_MIN}-${SCORE_MAX}` }),
          { status: 400, headers }
        );
      }

      const response: NPSResponse = {
        score,
        category: categorize(score),
        timestamp: new Date().toISOString(),
        ...(body.feedback
          ? { feedback: String(body.feedback).slice(0, MAX_FEEDBACK_LENGTH) }
          : {}),
        ...(body.sessionId ? { sessionId: String(body.sessionId).slice(0, 64) } : {}),
      };

      // Load existing data
      const raw = await store.get(DATA_KEY);
      const data: NPSData = raw ? JSON.parse(raw) : { responses: [] };

      // Append and trim to max
      data.responses.push(response);
      if (data.responses.length > MAX_RESPONSES) {
        data.responses = data.responses.slice(-MAX_RESPONSES);
      }

      // Save
      await store.set(DATA_KEY, JSON.stringify(data));

      // Record rate-limit timestamp for this IP
      await store.set(rateKey, String(Date.now()));

      return new Response(
        JSON.stringify({ ok: true, category: response.category }),
        { status: 201, headers }
      );
    } catch (err) {
      console.error("Failed to save NPS response:", err);
      return new Response(
        JSON.stringify({ error: "Internal server error" }),
        { status: 500, headers }
      );
    }
  }

  return new Response(JSON.stringify({ error: "Method not allowed" }), {
    status: 405,
    headers,
  });
};

export const config = {
  path: "/api/nps",
};
