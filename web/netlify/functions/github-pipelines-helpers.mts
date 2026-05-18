/**
 * Helper utilities for GitHub Pipelines Dashboard
 */
import type { getStore } from "@netlify/blobs";
import type { WorkflowRun, Status, Conclusion, PullRequestRef, CachedView } from "./github-pipelines-types";
import {
  ALLOWED_ORIGINS,
  GITHUB_API,
  GH_RETRY_MAX_ATTEMPTS,
  GH_RETRY_BASE_DELAY_MS,
  VALID_REPO_PATTERN,
  PR_FROM_COMMIT_RE,
  CACHE_TTL_MS,
} from "./github-pipelines-constants";

export function corsOrigin(origin: string | null): string {
  if (!origin) return ALLOWED_ORIGINS[0];
  if (ALLOWED_ORIGINS.includes(origin)) return origin;
  try {
    const host = new URL(origin).hostname.toLowerCase();
    if (host === "kubestellar.io" || host.endsWith(".kubestellar.io")) {
      return origin;
    }
    if (host === "localhost") return origin;
  } catch {
    // Malformed origin — fall through to default
  }
  return ALLOWED_ORIGINS[0];
}

export function jsonResponse(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {}
): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

export async function gh(path: string, token: string, init: RequestInit = {}): Promise<Response> {
  const url = path.startsWith("http") ? path : `${GITHUB_API}${path}`;
  const headers = {
    Accept: "application/vnd.github.v3+json",
    Authorization: `Bearer ${token}`,
    ...(init.headers ?? {}),
  };
  for (let attempt = 0; attempt < GH_RETRY_MAX_ATTEMPTS; attempt++) {
    const resp = await fetch(url, { ...init, headers, signal: AbortSignal.timeout(10_000) });
    if (resp.status !== 429 && resp.status !== 403) return resp;
    if (attempt === GH_RETRY_MAX_ATTEMPTS - 1) {
      console.warn(`[github-pipelines] retries exhausted for ${path}, status=${resp.status}`);
      return resp;
    }
    const retryAfter = resp.headers.get("Retry-After");
    const waitMs = retryAfter
      ? Math.min(parseInt(retryAfter, 10) * 1000, 10_000)
      : GH_RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
    await new Promise((r) => setTimeout(r, waitMs));
  }
  throw new Error("Unreachable");
}

export function isValidRepo(repo: string | null): boolean {
  return !!repo && VALID_REPO_PATTERN.test(repo);
}

/** YYYY-MM-DD in UTC */
export function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

/** Map GitHub's workflow_run shape to our WorkflowRun type */
export function normalizeRun(r: Record<string, unknown>, repo: string): WorkflowRun {
  let rawPRs = Array.isArray(r.pull_requests)
    ? (r.pull_requests as Array<{ number?: number; url?: string }>)
      .filter((pr) => typeof pr.number === "number")
      .map((pr) => ({ number: pr.number!, url: String(pr.url ?? "") }))
    : undefined;
  // For push events (merge commits), the pull_requests array is empty.
  // Extract the PR number from the commit message pattern "feat: … (#1234)".
  if ((!rawPRs || rawPRs.length === 0) && r.event === "push") {
    const headCommit = r.head_commit as { message?: string } | undefined;
    const msg = headCommit?.message ?? "";
    const m = PR_FROM_COMMIT_RE.exec(msg);
    if (m) {
      const num = Number(m[1]);
      if (num > 0) {
        rawPRs = [{ number: num, url: `https://github.com/${repo}/pull/${num}` }];
      }
    }
  }
  return {
    id: Number(r.id),
    repo,
    name: String(r.name ?? ""),
    workflowId: Number(r.workflow_id ?? 0),
    headBranch: String(r.head_branch ?? ""),
    status: (r.status as Status) ?? "completed",
    conclusion: (r.conclusion as Conclusion) ?? null,
    event: String(r.event ?? ""),
    runNumber: Number(r.run_number ?? 0),
    htmlUrl: String(r.html_url ?? ""),
    createdAt: String(r.created_at ?? ""),
    updatedAt: String(r.updated_at ?? ""),
    pullRequests: rawPRs?.length ? rawPRs : undefined,
  };
}

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------

export async function readCache<T>(
  store: ReturnType<typeof getStore>,
  key: string
): Promise<CachedView<T> | null> {
  try {
    const raw = await store.get(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedView<T>;
    if (Date.now() - parsed.fetchedAt > CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function writeCache<T>(
  store: ReturnType<typeof getStore>,
  key: string,
  payload: T
): Promise<void> {
  const entry: CachedView<T> = { payload, fetchedAt: Date.now() };
  await store.set(key, JSON.stringify(entry));
}
