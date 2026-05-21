/**
 * Netlify mirror of pkg/api/handlers/rewards_badge.go (RFC #8862 Phase 3).
 * GET /api/rewards/badge/:github_login — shields.io-style SVG tier badge.
 * Netlify edge handles rate limiting; no app-level limiter needed.
 */
import { getContributorLevel } from "../../src/types/rewards";
import { GITHUB_SCORING_GENERATED } from "../../src/types/rewards.generated";
import { readCappedJson } from "./_shared/read-capped-json";

const GITHUB_API = "https://api.github.com";
const MAX_PAGES = 10; // GitHub Search API caps at 1000 results
const PER_PAGE = 100; // GitHub maximum
const API_TIMEOUT_MS = 30_000;

const SEARCH_REPOS =
  "repo:kubestellar/console repo:kubestellar/console-marketplace repo:kubestellar/console-kb repo:kubestellar/docs";

// SVG dimensions — tuned to match rewards_badge.go exactly
const H_PX = 20;
const LW_PX = 82; // label width ("kubestellar")
const VW_PX = 82; // value width (tier name + icon)
const TW_PX = LW_PX + VW_PX;
const LMID_PX = LW_PX / 2;
const VMID_PX = LW_PX + VW_PX / 2 + 6;
const TEXT_BASELINE_PX = 14;
const TEXT_SHADOW_PX = 15;
const FONT_PX = 11;
const CORNER_PX = 3;

const ICON_X = LW_PX + 6;
const ICON_Y = 3;
const ICON_SIZE = 14;

const LABEL_TEXT = "kubestellar";
const LABEL_COLOR = "#555";
const UNKNOWN_NAME = "unknown";
const UNKNOWN_COLOR = "#9e9e9e";
const ERROR_NAME = "error";
const ERROR_COLOR = "#e05d44";
const CONTENT_TYPE = "image/svg+xml; charset=utf-8";
const CACHE_SUCCESS = "public, max-age=3600"; // 1h — tier rarely flips
const CACHE_ERROR = "no-store";
const LOGIN_RE = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,38})$/;
const PATH_PREFIX = "/api/rewards/badge/";
const STATUS_OK = 200;
const STATUS_BAD_GATEWAY = 502;

interface SearchItem {
  labels: Array<{ name: string }>;
  pull_request?: { merged_at?: string | null };
}
interface SearchResponse {
  total_count: number;
  items: SearchItem[];
}

/** Map tier color family → hex. Mirrors tierColorHex in rewards_badge.go. */
function tierColorHex(color: string): string {
  const map: Record<string, string> = {
    gray: "#6b7280", blue: "#3b82f6", cyan: "#06b6d4", green: "#10b981",
    purple: "#8b5cf6", orange: "#f97316", red: "#ef4444", yellow: "#f59e0b",
  };
  return map[color] ?? UNKNOWN_COLOR;
}

/** HTML-entity-encode text embedded in SVG (defense-in-depth). */
function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function renderSVG(tierName: string, tierColor: string, iconPath: string = ""): string {
  const label = esc(LABEL_TEXT);
  const value = esc(tierName);
  const iconScale = (ICON_SIZE / 24).toFixed(3);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${TW_PX}" height="${H_PX}" role="img" aria-label="${label}: ${value}">
<linearGradient id="s" x2="0" y2="100%">
<stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
<stop offset="1" stop-opacity=".1"/>
</linearGradient>
<clipPath id="r"><rect width="${TW_PX}" height="${H_PX}" rx="${CORNER_PX}" fill="#fff"/></clipPath>
<g clip-path="url(#r)">
<rect width="${LW_PX}" height="${H_PX}" fill="${LABEL_COLOR}"/>
<rect x="${LW_PX}" width="${VW_PX}" height="${H_PX}" fill="${tierColor}"/>
<rect width="${TW_PX}" height="${H_PX}" fill="url(#s)"/>
</g>
<g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="${FONT_PX}">
<text x="${LMID_PX}" y="${TEXT_SHADOW_PX}" fill="#010101" fill-opacity=".3">${label}</text>
<text x="${LMID_PX}" y="${TEXT_BASELINE_PX}">${label}</text>
<text x="${VMID_PX}" y="${TEXT_SHADOW_PX}" fill="#010101" fill-opacity=".3">${value}</text>
<text x="${VMID_PX}" y="${TEXT_BASELINE_PX}">${value}</text>
</g>
${iconPath ? `
<g transform="translate(${ICON_X},${ICON_Y}) scale(${iconScale})">
<path fill="#fff" d="${iconPath}"/>
</g>` : ""}
</svg>`;
}

function svgResponse(status: number, svg: string, cacheControl: string): Response {
  return new Response(svg, {
    status,
    headers: { "Content-Type": CONTENT_TYPE, "Cache-Control": cacheControl },
  });
}

async function searchItems(login: string, itemType: "issue" | "pr", token: string): Promise<SearchItem[]> {
  const yearStart = `${new Date().getFullYear()}-01-01`;
  const query = `author:${login} ${SEARCH_REPOS} type:${itemType} created:>=${yearStart}`;
  const all: SearchItem[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `${GITHUB_API}/search/issues?q=${encodeURIComponent(query)}&per_page=${PER_PAGE}&page=${page}&sort=created&order=desc`;
    const headers: Record<string, string> = { Accept: "application/vnd.github.v3+json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(API_TIMEOUT_MS) });
    if (!res.ok) {
      // 404/422 ⇒ unknown-login (gray badge); other codes ⇒ propagate (red badge)
      if (res.status === 404 || res.status === 422) {
        const err = new Error("unknown-login") as Error & { unknownLogin?: boolean };
        err.unknownLogin = true;
        throw err;
      }
      throw new Error(`GitHub API ${res.status}`);
    }
    const sr: SearchResponse = await readCappedJson<SearchResponse>(res, "GitHub Search API");
    all.push(...sr.items);
    if (all.length >= sr.total_count || sr.items.length < PER_PAGE) break;
  }
  return all;
}

function scorePoints(issues: SearchItem[], prs: SearchItem[]): number {
  let total = 0;
  for (const it of issues) {
    let pts: number = GITHUB_SCORING_GENERATED.OtherIssue;
    for (const lbl of it.labels || []) {
      if (["bug", "kind/bug", "type/bug"].includes(lbl.name)) {
        pts = GITHUB_SCORING_GENERATED.BugIssue;
        break;
      }
      if (["enhancement", "feature", "kind/feature", "type/feature"].includes(lbl.name)) {
        pts = GITHUB_SCORING_GENERATED.FeatureIssue;
      }
    }
    total += pts;
  }
  for (const pr of prs) {
    total += GITHUB_SCORING_GENERATED.PROpened;
    if (pr.pull_request?.merged_at) total += GITHUB_SCORING_GENERATED.PRMerged;
  }
  return total;
}

export default async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const login = url.pathname.startsWith(PATH_PREFIX)
    ? url.pathname.slice(PATH_PREFIX.length).trim()
    : "";

  if (!login || !LOGIN_RE.test(login)) {
    return svgResponse(STATUS_BAD_GATEWAY, renderSVG(ERROR_NAME, ERROR_COLOR), CACHE_ERROR);
  }

  // @ts-ignore: process is available in Netlify Node.js environment
  const token = process.env.GITHUB_TOKEN || "";
  try {
    const [issues, prs] = await Promise.all([
      searchItems(login, "issue", token),
      searchItems(login, "pr", token),
    ]);
    const points = scorePoints(issues, prs);
    const { current } = getContributorLevel(points);
    return svgResponse(STATUS_OK, renderSVG(current.name, tierColorHex(current.color), current.iconPath), CACHE_SUCCESS);
  } catch (err) {
    const isUnknown =
      err instanceof Error && (err as Error & { unknownLogin?: boolean }).unknownLogin === true;
    if (isUnknown) {
      return svgResponse(STATUS_OK, renderSVG(UNKNOWN_NAME, UNKNOWN_COLOR), CACHE_SUCCESS);
    }
    return svgResponse(STATUS_BAD_GATEWAY, renderSVG(ERROR_NAME, ERROR_COLOR), CACHE_ERROR);
  }
};

export const config = {
  path: "/api/rewards/badge/*",
};
