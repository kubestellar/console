/**
 * Analytics ACCM — GitHub API data fetchers
 */

import {
  GITHUB_API,
  REPO,
  PER_PAGE,
  MAX_PAGES,
  API_TIMEOUT_MS,
  CI_WORKFLOWS,
  daysSinceProjectStart,
} from "./helpers";

// ---------------------------------------------------------------------------
// Response size cap
// ---------------------------------------------------------------------------

const MAX_RESPONSE_BYTES = 512_000;
const MAX_ERROR_BODY_BYTES = 1_024;

async function readCappedText(res: Response, maxBytes: number): Promise<string> {
  const contentLength = parseInt(res.headers.get("content-length") || "0", 10);
  if (contentLength > maxBytes) {
    return `[body too large: ${contentLength} bytes]`;
  }
  const text = await res.text();
  if (text.length > maxBytes) {
    return text.slice(0, maxBytes) + "…[truncated]";
  }
  return text;
}

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
// Types
// ---------------------------------------------------------------------------

export interface PRItem {
  created_at: string;
  merged_at: string | null;
  user: { login: string };
  labels: { name: string }[];
}

export interface IssueItem {
  created_at: string;
  closed_at: string | null;
  user: { login: string };
  labels: { name: string }[];
  pull_request?: unknown;
}

export interface WorkflowRunItem {
  created_at: string;
  conclusion: string | null;
  status: string;
}

// ---------------------------------------------------------------------------
// Pagination helper
// ---------------------------------------------------------------------------

async function fetchPaginated<T>(
  url: string,
  token: string,
  extractItems: (body: Record<string, unknown>) => T[],
): Promise<T[]> {
  const allItems: T[] = [];
  const separator = url.includes("?") ? "&" : "?";

  for (let page = 1; page <= MAX_PAGES; page++) {
    const pageUrl = `${url}${separator}per_page=${PER_PAGE}&page=${page}`;
    const headers: Record<string, string> = {
      Accept: "application/vnd.github.v3+json",
    };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(pageUrl, {
      headers,
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });

    if (!res.ok) {
      if (res.status === 404) return allItems;
      const body = await readCappedText(res, MAX_ERROR_BODY_BYTES);
      throw new Error(`GitHub API ${res.status}: ${body.slice(0, 300)}`);
    }

    const data = await readCappedJson<Record<string, unknown>>(res);
    const items = extractItems(data as Record<string, unknown>);
    allItems.push(...items);

    if (items.length < PER_PAGE) break;
  }

  return allItems;
}

// ---------------------------------------------------------------------------
// Exported fetchers
// ---------------------------------------------------------------------------

/** Fetch PRs created since the project start date */
export async function fetchRecentPRs(token: string): Promise<PRItem[]> {
  const since = new Date();
  since.setDate(since.getDate() - daysSinceProjectStart());
  const sinceStr = since.toISOString().split("T")[0];

  const url = `${GITHUB_API}/search/issues?q=repo:${REPO}+type:pr+created:>=${sinceStr}&sort=created&order=desc`;
  return fetchPaginated(url, token, (body) => {
    const items = (body.items || []) as Array<{
      created_at: string;
      pull_request?: { merged_at?: string | null };
      user: { login: string };
      labels: { name: string }[];
    }>;
    return items.map((item) => ({
      created_at: item.created_at,
      merged_at: item.pull_request?.merged_at ?? null,
      user: item.user,
      labels: item.labels || [],
    }));
  });
}

/** Fetch issues created since the project start date */
export async function fetchRecentIssues(token: string): Promise<IssueItem[]> {
  const since = new Date();
  since.setDate(since.getDate() - daysSinceProjectStart());
  const sinceStr = since.toISOString().split("T")[0];

  const url = `${GITHUB_API}/search/issues?q=repo:${REPO}+type:issue+created:>=${sinceStr}&sort=created&order=desc`;
  return fetchPaginated(url, token, (body) => {
    const items = (body.items || []) as IssueItem[];
    return items.filter((item) => !item.pull_request);
  });
}

/** Fetch workflow runs for a named workflow */
export async function fetchWorkflowRuns(
  workflowName: string,
  token: string,
): Promise<WorkflowRunItem[]> {
  const listUrl = `${GITHUB_API}/repos/${REPO}/actions/workflows`;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const listRes = await fetch(listUrl, {
    headers,
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  });
  if (!listRes.ok) return [];

  const listData = await readCappedJson<Record<string, unknown>>(listRes);
  const workflows = (listData.workflows || []) as Array<{
    id: number;
    name: string;
  }>;
  const workflow = workflows.find(
    (w) => w.name.toLowerCase() === workflowName.toLowerCase(),
  );
  if (!workflow) return [];

  const since = new Date();
  since.setDate(since.getDate() - daysSinceProjectStart());
  const sinceStr = since.toISOString().split("T")[0];

  const runsUrl = `${GITHUB_API}/repos/${REPO}/actions/workflows/${workflow.id}/runs?created=>${sinceStr}&status=completed`;
  return fetchPaginated(runsUrl, token, (body) => {
    const runs = (body.workflow_runs || []) as WorkflowRunItem[];
    return runs;
  });
}
