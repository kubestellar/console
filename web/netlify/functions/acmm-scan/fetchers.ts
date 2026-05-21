/**
 * ACMM Scan — GitHub API fetchers
 */

import {
  GITHUB_API,
  API_TIMEOUT_MS,
  WEEKS_OF_HISTORY,
  isoWeek,
  lastNWeeks,
  isAIContribution,
} from "./helpers";
import type { WeeklyActivity, GitTreeEntry } from "./helpers";

// ---------------------------------------------------------------------------
// Response size cap
// ---------------------------------------------------------------------------

const MAX_RESPONSE_BYTES = 512_000;

async function readCappedJson<T>(res: Response): Promise<T> {
  const contentLength = parseInt(res.headers.get("content-length") || "0", 10);
  if (contentLength > MAX_RESPONSE_BYTES) {
    throw new Error(`Response too large: content-length ${contentLength} exceeds ${MAX_RESPONSE_BYTES}`);
  }
  const text = await res.text();
  if (text.length > MAX_RESPONSE_BYTES) {
    throw new Error(`Response too large: body ${text.length} bytes exceeds ${MAX_RESPONSE_BYTES}`);
  }
  return JSON.parse(text) as T;
}

// ---------------------------------------------------------------------------
// Search pagination
// ---------------------------------------------------------------------------

const SEARCH_PAGE_SIZE = 100;
const SEARCH_MAX_PAGES = 10;

interface SearchItem {
  created_at: string;
  pull_request?: { merged_at?: string | null };
  closed_at?: string | null;
  user: { login: string };
  labels: { name: string }[];
}

async function searchAllPages(
  baseUrl: string,
  headers: Record<string, string>,
): Promise<SearchItem[]> {
  const items: SearchItem[] = [];
  for (let page = 1; page <= SEARCH_MAX_PAGES; page++) {
    const url = `${baseUrl}&per_page=${SEARCH_PAGE_SIZE}&page=${page}`;
    const res = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });
    if (!res.ok) break;
    const body = await readCappedJson<{ items?: SearchItem[] }>(res);
    const pageItems = body.items || [];
    items.push(...pageItems);
    if (pageItems.length < SEARCH_PAGE_SIZE) break;
  }
  return items;
}

// ---------------------------------------------------------------------------
// Exported fetchers
// ---------------------------------------------------------------------------

export async function fetchTreePaths(repo: string, token: string): Promise<Set<string>> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const repoRes = await fetch(`${GITHUB_API}/repos/${repo}`, {
    headers,
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  });
  if (!repoRes.ok) {
    if (repoRes.status === 404) throw new Error("Repo not found");
    throw new Error(`GitHub repo API ${repoRes.status}`);
  }
  const repoInfo = await readCappedJson<{ default_branch?: string }>(repoRes);
  const branch = repoInfo.default_branch || "main";

  const url = `${GITHUB_API}/repos/${repo}/git/trees/${branch}?recursive=1`;
  const res = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  });
  if (!res.ok) {
    if (res.status === 404) throw new Error("Repo not found");
    throw new Error(`GitHub tree API ${res.status}`);
  }
  const data = await readCappedJson<{ tree?: GitTreeEntry[] }>(res);
  const paths = new Set<string>();
  for (const entry of data.tree || []) {
    paths.add(entry.path);
  }
  return paths;
}

export async function fetchWeeklyActivity(
  repo: string,
  token: string,
): Promise<WeeklyActivity[]> {
  const weeks = lastNWeeks(WEEKS_OF_HISTORY);
  const buckets = new Map<string, WeeklyActivity>();
  for (const w of weeks) {
    buckets.set(w, {
      week: w,
      aiPrs: 0,
      humanPrs: 0,
      aiIssues: 0,
      humanIssues: 0,
    });
  }

  const since = new Date();
  since.setDate(since.getDate() - WEEKS_OF_HISTORY * 7);
  const sinceStr = since.toISOString().split("T")[0];

  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const prItems = await searchAllPages(
    `${GITHUB_API}/search/issues?q=repo:${repo}+type:pr+created:>=${sinceStr}`,
    headers,
  );
  for (const item of prItems) {
    const week = isoWeek(new Date(item.created_at));
    const b = buckets.get(week);
    if (!b) continue;
    if (isAIContribution(item.labels, item.user.login)) b.aiPrs++;
    else b.humanPrs++;
  }

  const issueItems = await searchAllPages(
    `${GITHUB_API}/search/issues?q=repo:${repo}+type:issue+created:>=${sinceStr}`,
    headers,
  );
  for (const item of issueItems) {
    if (item.pull_request) continue;
    const week = isoWeek(new Date(item.created_at));
    const b = buckets.get(week);
    if (!b) continue;
    if (isAIContribution(item.labels, item.user.login)) b.aiIssues++;
    else b.humanIssues++;
  }

  return weeks.map((w) => buckets.get(w)!);
}
