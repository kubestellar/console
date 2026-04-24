/**
 * Netlify Function: GitHub Rewards
 *
 * Fetches a user's GitHub contribution data (issues + PRs) across configured
 * orgs and computes reward points. This is the Netlify equivalent of
 * pkg/api/handlers/rewards.go for serverless deployment.
 *
 * GITHUB_TOKEN must be set as a Netlify environment variable.
 *
 * The client passes the user's github_login via the Authorization header
 * (JWT from the Go backend) or as a ?login= query param. On Netlify we
 * cannot validate the JWT (no shared secret), so we accept the login param
 * directly. This is safe because the data is computed from public GitHub
 * activity — no secrets are exposed.
 */

import { getStore } from "@netlify/blobs";
import { buildCorsHeaders, handlePreflight } from "./_shared/cors";

const GITHUB_API = "https://api.github.com";
const CACHE_STORE = "github-rewards";
/** Server-side cache TTL for rewards data (10 minutes) */
const CACHE_TTL_MS = 10 * 60 * 1000;
/** GitHub Search API results per page (max 100) */
const PER_PAGE = 100;
/** Max pages to fetch (GitHub caps search at 1000 results) */
const MAX_PAGES = 10;
/** Request timeout for GitHub API calls (30 seconds) */
const API_TIMEOUT_MS = 30_000;

/** Point values for contribution types — must match rewards.go */
const POINTS_BUG_ISSUE = 300;
const POINTS_FEATURE_ISSUE = 100;
const POINTS_OTHER_ISSUE = 50;
const POINTS_PR_OPENED = 200;
const POINTS_PR_MERGED = 500;

/** Repos to search for contributions */
const SEARCH_REPOS =
  "repo:kubestellar/console repo:kubestellar/console-marketplace repo:kubestellar/console-kb repo:kubestellar/docs";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GitHubContribution {
  type: string;
  title: string;
  url: string;
  repo: string;
  number: number;
  points: number;
  created_at: string;
}

interface RewardsBreakdown {
  bug_issues: number;
  feature_issues: number;
  other_issues: number;
  prs_opened: number;
  prs_merged: number;
}

interface GitHubRewardsResponse {
  total_points: number;
  contributions: GitHubContribution[];
  breakdown: RewardsBreakdown;
  cached_at: string;
  from_cache: boolean;
}

interface SearchItem {
  title: string;
  html_url: string;
  number: number;
  created_at: string;
  labels: Array<{ name: string }>;
  pull_request?: { merged_at?: string | null };
  repository_url: string;
}

interface SearchResponse {
  total_count: number;
  items: SearchItem[];
}

interface CacheEntry {
  response: GitHubRewardsResponse;
  storedAt: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractRepo(repoUrl: string): string {
  const prefix = "https://api.github.com/repos/";
  return repoUrl.startsWith(prefix) ? repoUrl.slice(prefix.length) : repoUrl;
}

function classifyIssue(item: SearchItem): GitHubContribution {
  let type = "issue_other";
  let points = POINTS_OTHER_ISSUE;

  for (const label of item.labels || []) {
    if (["bug", "kind/bug", "type/bug"].includes(label.name)) {
      type = "issue_bug";
      points = POINTS_BUG_ISSUE;
    } else if (
      ["enhancement", "feature", "kind/feature", "type/feature"].includes(
        label.name
      )
    ) {
      type = "issue_feature";
      points = POINTS_FEATURE_ISSUE;
    }
  }

  return {
    type,
    title: item.title,
    url: item.html_url,
    repo: extractRepo(item.repository_url),
    number: item.number,
    points,
    created_at: item.created_at,
  };
}

function classifyPR(item: SearchItem): GitHubContribution[] {
  const repo = extractRepo(item.repository_url);
  const result: GitHubContribution[] = [
    {
      type: "pr_opened",
      title: item.title,
      url: item.html_url,
      repo,
      number: item.number,
      points: POINTS_PR_OPENED,
      created_at: item.created_at,
    },
  ];

  if (item.pull_request?.merged_at) {
    result.push({
      type: "pr_merged",
      title: item.title,
      url: item.html_url,
      repo,
      number: item.number,
      points: POINTS_PR_MERGED,
      created_at: item.pull_request.merged_at,
    });
  }

  return result;
}

async function searchItems(
  login: string,
  itemType: "issue" | "pr",
  token: string
): Promise<SearchItem[]> {
  const yearStart = `${new Date().getFullYear()}-01-01`;
  const query = `author:${login} ${SEARCH_REPOS} type:${itemType} created:>=${yearStart}`;
  const allItems: SearchItem[] = [];

  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `${GITHUB_API}/search/issues?q=${encodeURIComponent(query)}&per_page=${PER_PAGE}&page=${page}&sort=created&order=desc`;
    const headers: Record<string, string> = {
      Accept: "application/vnd.github.v3+json",
    };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });
    if (!res.ok) {
      throw new Error(`GitHub API ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }

    const sr: SearchResponse = await res.json();
    allItems.push(...sr.items);

    if (allItems.length >= sr.total_count || sr.items.length < PER_PAGE) {
      break;
    }
  }

  return allItems;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export default async (req: Request) => {
  // See web/netlify/functions/_shared/cors.ts for allowlist rationale (#9879).
  const corsOpts = {
    methods: "GET, OPTIONS",
    headers: "Content-Type, Authorization, Accept",
  };
  const corsHeaders = {
    ...buildCorsHeaders(req, corsOpts),
    "Cache-Control": "no-cache, no-store",
  };

  if (req.method === "OPTIONS") {
    return handlePreflight(req, corsOpts);
  }

  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Extract github_login from query param
  const url = new URL(req.url);
  const login = url.searchParams.get("login");

  if (!login || !/^[a-zA-Z0-9_-]+$/.test(login)) {
    return new Response(
      JSON.stringify({ error: "Missing or invalid login parameter" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  const token = Netlify.env.get("GITHUB_TOKEN") || "";

  // Check Netlify Blobs cache
  try {
    const store = getStore(CACHE_STORE);
    const cached = await store.get(login, { type: "json" }) as CacheEntry | null;
    if (cached && Date.now() - cached.storedAt < CACHE_TTL_MS) {
      const response = { ...cached.response, from_cache: true };
      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch {
    // Cache miss or blob error — proceed to fetch
  }

  // Fetch from GitHub
  try {
    const contributions: GitHubContribution[] = [];

    const [issues, prs] = await Promise.all([
      searchItems(login, "issue", token),
      searchItems(login, "pr", token),
    ]);

    for (const item of issues) {
      contributions.push(classifyIssue(item));
    }
    for (const item of prs) {
      contributions.push(...classifyPR(item));
    }

    // Compute totals
    let totalPoints = 0;
    const breakdown: RewardsBreakdown = {
      bug_issues: 0,
      feature_issues: 0,
      other_issues: 0,
      prs_opened: 0,
      prs_merged: 0,
    };

    for (const c of contributions) {
      totalPoints += c.points;
      switch (c.type) {
        case "issue_bug":
          breakdown.bug_issues++;
          break;
        case "issue_feature":
          breakdown.feature_issues++;
          break;
        case "issue_other":
          breakdown.other_issues++;
          break;
        case "pr_opened":
          breakdown.prs_opened++;
          break;
        case "pr_merged":
          breakdown.prs_merged++;
          break;
      }
    }

    const response: GitHubRewardsResponse = {
      total_points: totalPoints,
      contributions,
      breakdown,
      cached_at: new Date().toISOString(),
      from_cache: false,
    };

    // Store in Netlify Blobs cache
    try {
      const store = getStore(CACHE_STORE);
      const entry: CacheEntry = { response, storedAt: Date.now() };
      await store.setJSON(login, entry);
    } catch {
      // Cache write failure is non-fatal
    }

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: "GitHub API unavailable", detail: message }),
      {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
};

export const config = {
  path: "/api/rewards/github",
};
