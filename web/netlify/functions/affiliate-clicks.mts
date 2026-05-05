/**
 * Netlify Function: Affiliate Clicks
 *
 * Returns affiliate click counts from GA4, keyed by GitHub login.
 * Queries two campaigns:
 *   - intern_outreach: utm_term is intern-01..10, mapped to GitHub logins via INTERN_MAP
 *   - contributor_affiliate: utm_term IS the GitHub handle directly (no mapping)
 * Used by the docs leaderboard to show a "Social" column.
 *
 * Uses raw fetch + Web Crypto JWT (same pattern as analytics-dashboard.mts)
 * instead of the googleapis npm package — Netlify Functions don't bundle
 * googleapis reliably and it caused a persistent 502.
 *
 * Requires Netlify env vars: GA4_SERVICE_ACCOUNT_JSON (base64), GA4_PROPERTY_ID
 */

// ── Constants ─────────────────────────────────────────────────────────

const GA4_DATA_API = "https://analyticsdata.googleapis.com/v1beta";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const JWT_EXPIRY_SECONDS = 3600;

/** Map GitHub login → utm_term for intern affiliate links */
const INTERN_MAP: Record<string, string> = {
  "rishi-jat": "intern-01",
  "ghanshyam2005singh": "intern-02",
  "arnavgogia20": "intern-03",
  "mrhapile": "intern-04",
  "aaradhychinche-alt": "intern-05",
  "xonas1101": "intern-06",
  "Arpit529Srivastava": "intern-07",
  "shivansh-source": "intern-08",
  "AAdIprog": "intern-09",
  "Abhishek-Punhani": "intern-10",
};

/** Reverse map: utm_term → GitHub login (lowercased) */
const TERM_TO_LOGIN: Record<string, string> = {};
for (const [login, term] of Object.entries(INTERN_MAP)) {
  TERM_TO_LOGIN[term] = login.toLowerCase();
}

/** Cache TTL — 3 minutes. Shorter than before (was 15m) so intern shares
 *  feel responsive on the leaderboard once GA4 has processed the clicks. */
const CACHE_TTL_MS = 3 * 60 * 1000;
/** Days to look back for affiliate clicks */
const LOOKBACK_DAYS = 90;

const GH_LOGIN_MIN_LEN = 2;
const GH_LOGIN_MAX_LEN = 39;
const GH_LOGIN_PATTERN = /^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){1,38}$/;

/** Max rows to return per GA4 query */
const GA4_QUERY_LIMIT = 50;

function isPlausibleGitHubLogin(term: string): boolean {
  if (term.length < GH_LOGIN_MIN_LEN || term.length > GH_LOGIN_MAX_LEN) return false;
  if (/^intern-\d+$/.test(term)) return false;
  return GH_LOGIN_PATTERN.test(term);
}

// ── Types ─────────────────────────────────────────────────────────────

interface AffiliateData {
  clicks: number;
  unique_users: number;
  utm_term: string;
}

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
}

interface GA4Row {
  dimensionValues: { value: string }[];
  metricValues: { value: string }[];
}

// ── CORS ──────────────────────────────────────────────────────────────

const ALLOWED_ORIGINS = [
  "https://console.kubestellar.io",
  "https://kubestellar.io",
  "https://www.kubestellar.io",
];

function corsOrigin(origin: string | null): string {
  if (!origin) return ALLOWED_ORIGINS[0];
  if (ALLOWED_ORIGINS.includes(origin)) return origin;
  try {
    const host = new URL(origin).hostname.toLowerCase();
    if (host === "kubestellar.io" || host.endsWith(".kubestellar.io")) {
      return origin;
    }
  } catch {
    // Malformed origin — fall through to default
  }
  return ALLOWED_ORIGINS[0];
}

// ── JWT / OAuth helpers (Web Crypto — no npm deps) ────────────────────

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

const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;
let cachedToken: { accessToken: string; expiresAt: number } | null = null;

async function getAccessToken(serviceAccount: ServiceAccountKey): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - TOKEN_REFRESH_BUFFER_MS) {
    return cachedToken.accessToken;
  }

  const jwt = await createSignedJWT(serviceAccount);
  const resp = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Token exchange failed (${resp.status}): ${body}`);
  }

  const data = await resp.json();
  const accessToken = data.access_token;
  const expiresIn = data.expires_in || JWT_EXPIRY_SECONDS;

  cachedToken = { accessToken, expiresAt: Date.now() + expiresIn * 1000 };
  return accessToken;
}

// ── GA4 Data API ──────────────────────────────────────────────────────

async function runReport(
  propertyId: string,
  accessToken: string,
  body: Record<string, unknown>
): Promise<GA4Row[]> {
  const resp = await fetch(
    `${GA4_DATA_API}/properties/${propertyId}:runReport`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`GA4 API ${resp.status}: ${text}`);
  }

  const data = await resp.json();
  return data.rows || [];
}

// ── Core logic ────────────────────────────────────────────────────────

let cachedResult: { data: Record<string, AffiliateData>; fetchedAt: number } | null = null;

async function fetchAffiliateClicks(): Promise<Record<string, AffiliateData>> {
  const serviceAccountB64 = process.env.GA4_SERVICE_ACCOUNT_JSON;
  const propertyId = process.env.GA4_PROPERTY_ID;

  if (!serviceAccountB64 || !propertyId) {
    console.warn("GA4_SERVICE_ACCOUNT_JSON or GA4_PROPERTY_ID not set in Netlify env vars");
    return {};
  }

  let credentials: ServiceAccountKey;
  try {
    credentials = JSON.parse(
      Buffer.from(serviceAccountB64, "base64").toString("utf-8")
    );
  } catch {
    console.error("GA4_SERVICE_ACCOUNT_JSON is not valid base64-encoded JSON");
    return {};
  }

  const accessToken = await getAccessToken(credentials);

  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - LOOKBACK_DAYS * 86400000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const dateRange = { startDate: fmt(startDate), endDate: fmt(endDate) };

  // Query 1: intern_outreach campaign (intern-01..10 → GitHub login via INTERN_MAP)
  const internRows = await runReport(propertyId, accessToken, {
    dateRanges: [dateRange],
    dimensions: [{ name: "sessionManualTerm" }],
    metrics: [{ name: "sessions" }, { name: "activeUsers" }],
    dimensionFilter: {
      filter: {
        fieldName: "sessionCampaignName",
        stringFilter: { matchType: "EXACT", value: "intern_outreach" },
      },
    },
    limit: GA4_QUERY_LIMIT,
  });

  // Query 2: contributor_affiliate campaign (utm_term IS the GitHub handle)
  const contributorRows = await runReport(propertyId, accessToken, {
    dateRanges: [dateRange],
    dimensions: [{ name: "sessionManualTerm" }],
    metrics: [{ name: "sessions" }, { name: "activeUsers" }],
    dimensionFilter: {
      filter: {
        fieldName: "sessionCampaignName",
        stringFilter: { matchType: "EXACT", value: "contributor_affiliate" },
      },
    },
    limit: GA4_QUERY_LIMIT,
  });

  const result: Record<string, AffiliateData> = {};

  function mergeEntry(login: string, utmTerm: string, sessions: number, users: number): void {
    const key = login.toLowerCase();
    if (result[key]) {
      result[key].clicks += sessions;
      result[key].unique_users += users;
    } else {
      result[key] = { clicks: sessions, unique_users: users, utm_term: utmTerm };
    }
  }

  for (const row of internRows) {
    const utmTerm = row.dimensionValues?.[0]?.value;
    const sessions = parseInt(row.metricValues?.[0]?.value || "0");
    const users = parseInt(row.metricValues?.[1]?.value || "0");

    if (!utmTerm) continue;

    if (TERM_TO_LOGIN[utmTerm]) {
      mergeEntry(TERM_TO_LOGIN[utmTerm], utmTerm, sessions, users);
    } else if (isPlausibleGitHubLogin(utmTerm)) {
      mergeEntry(utmTerm, utmTerm, sessions, users);
    }
  }

  for (const row of contributorRows) {
    const utmTerm = row.dimensionValues?.[0]?.value;
    const sessions = parseInt(row.metricValues?.[0]?.value || "0");
    const users = parseInt(row.metricValues?.[1]?.value || "0");

    if (!utmTerm || !isPlausibleGitHubLogin(utmTerm)) continue;

    mergeEntry(utmTerm, utmTerm, sessions, users);
  }

  // Fill in zeros for interns with no clicks
  for (const [login, term] of Object.entries(INTERN_MAP)) {
    const key = login.toLowerCase();
    if (!result[key]) {
      result[key] = { clicks: 0, unique_users: 0, utm_term: term };
    }
  }

  return result;
}

// ── Handler ───────────────────────────────────────────────────────────

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

  try {
    if (cachedResult && Date.now() - cachedResult.fetchedAt < CACHE_TTL_MS) {
      return new Response(JSON.stringify(cachedResult.data), {
        status: 200,
        headers,
      });
    }

    const data = await fetchAffiliateClicks();
    cachedResult = { data, fetchedAt: Date.now() };

    return new Response(JSON.stringify(data), { status: 200, headers });
  } catch (err) {
    console.error("Failed to fetch affiliate clicks:", err);
    if (cachedResult) {
      return new Response(JSON.stringify(cachedResult.data), {
        status: 200,
        headers,
      });
    }
    return new Response(
      JSON.stringify({ error: "Failed to fetch affiliate data" }),
      { status: 502, headers }
    );
  }
};

export const config = {
  path: "/api/affiliate/clicks",
};
