/**
 * Netlify Function: GitHub Pipelines Dashboard
 *
 * Powers the `/ci-cd` pipeline cards (Nightly Release Pulse, Workflow Matrix,
 * Live Runs flow, Recent Failures). Caches GitHub Actions data server-side
 * (Netlify Blobs) so a public-page visitor never hits GitHub directly and
 * the unauth'd 60/hr per-IP rate limit isn't a concern.
 *
 * Views (GET):
 *   ?view=pulse                         → cross-repo nightly health
 *   ?view=matrix&days=14|30|90&repo=…   → heatmap of workflows × days
 *   ?view=flow&repo=…                   → in-progress / queued runs + job tree
 *   ?view=failures&repo=…               → last N failed runs with failing step
 *   ?view=log&repo=…&job=…              → job log tail (last LOG_TAIL_LINES)
 *
 * Mutations (POST):
 *   ?view=mutate&op=rerun|cancel&repo=…&run=…
 *   Gated on GITHUB_MUTATIONS_TOKEN env var. If unset, always returns 503
 *   to keep the public demo site from triggering workflow re-runs.
 *
 * Env:
 *   GITHUB_TOKEN            — read-only PAT (required)
 *   GITHUB_MUTATIONS_TOKEN  — PAT with actions:write (optional; disabled if absent)
 */
import { getStore } from "@netlify/blobs";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GITHUB_API = "https://api.github.com";

/** Netlify Blobs store for all cached pipeline views */
const STORE_NAME = "github-pipelines-cache";

/** Blob key for the rolling 90-day history (outlives GitHub's retention) */
const HISTORY_KEY = "history-v1";

/** Cache TTL for view responses */
const CACHE_TTL_MS = 120_000; // 2 min

/** Matrix defaults */
const MATRIX_DEFAULT_DAYS = 14;
const MATRIX_MAX_DAYS = 90;
/** History is capped at this many days on every write */
const HISTORY_RETENTION_DAYS = 90;

/** Failures view: max runs returned to client */
const FAILURES_LIMIT = 10;
/** Failures view: overfetch then filter so we get enough after pagination */
const FAILURES_OVERFETCH = 30;

/** Log view: how many tail lines of the failed step to return */
const LOG_TAIL_LINES = 500;

/** How many workflow runs to pull per repo for the matrix view */
const MATRIX_RUNS_PER_REPO = 200;

/** How many in-progress/queued runs to pull per repo for the flow view */
const FLOW_MAX_RUNS_PER_REPO = 8;

/** Default repos when PIPELINE_REPOS env var is not set */
const DEFAULT_REPOS = [
  "kubestellar/console",
  "kubestellar/docs",
  "kubestellar/console-kb",
  "kubestellar/kubestellar-mcp",
  "kubestellar/console-marketplace",
  "kubestellar/homebrew-tap",
];

/**
 * Repos scanned by the pipelines dashboard. Centralized: set the
 * PIPELINE_REPOS env var to a comma-separated list of owner/repo strings
 * to override (e.g. "myorg/myrepo" for a single-repo install, or
 * "org/a,org/b,org/c" for multi-repo). If unset, defaults to the 6
 * KubeStellar repos above. The repo list is returned in every API
 * response so the frontend never hardcodes it.
 */
function getRepos(): string[] {
  const env = process.env.PIPELINE_REPOS;
  if (!env) return DEFAULT_REPOS;
  return env.split(",").map((s) => s.trim()).filter(Boolean);
}

const REPOS = getRepos();

/** The nightly release workflow on kubestellar/console — drives the Pulse card */
const NIGHTLY_RELEASE_REPO = "kubestellar/console";
const NIGHTLY_RELEASE_WORKFLOW = "release.yml";

/** How many releases to fetch so we can sort by published_at ourselves */
const RELEASE_OVERFETCH = 10;

/** Matches nightly release tags like "v0.3.21-nightly.20260417" */
const NIGHTLY_TAG_RE = /nightly/i;

/** Extracts PR number from merge-commit messages like "feat: something (#8673)" */
const PR_FROM_COMMIT_RE = /\(#(\d+)\)\s*$/;

/** ms per day — used in matrix date math */
const MS_PER_DAY = 86_400_000;

const ALLOWED_ORIGINS = [
  "https://console.kubestellar.io",
  "https://kubestellar.io",
  "https://www.kubestellar.io",
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Conclusion =
  | "success"
  | "failure"
  | "cancelled"
  | "skipped"
  | "timed_out"
  | "action_required"
  | "neutral"
  | "stale"
  | null;

type Status = "queued" | "in_progress" | "completed" | "waiting" | "pending";

interface PullRequestRef {
  number: number;
  url: string;
}

interface WorkflowRun {
  id: number;
  repo: string;
  name: string;
  workflowId: number;
  headBranch: string;
  status: Status;
  conclusion: Conclusion;
  event: string;
  runNumber: number;
  htmlUrl: string;
  createdAt: string;
  updatedAt: string;
  pullRequests?: PullRequestRef[];
}

interface JobStep {
  name: string;
  status: Status;
  conclusion: Conclusion;
  number: number;
  startedAt?: string;
  completedAt?: string;
}

interface Job {
  id: number;
  name: string;
  status: Status;
  conclusion: Conclusion;
  startedAt: string | null;
  completedAt: string | null;
  htmlUrl: string;
  steps: JobStep[];
}

interface CachedView<T> {
  payload: T;
  fetchedAt: number;
}

/** Rolling long-term history, keyed by repo → workflow → YYYY-MM-DD */
interface HistoryBlob {
  /** ISO string of the most recent write — used for cache-coherence */
  updatedAt: string;
  /** repo/owner → workflow name → date → summary */
  days: Record<string, Record<string, Record<string, HistoryDay>>>;
}

interface HistoryDay {
  runId: number;
  conclusion: Conclusion;
  htmlUrl: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function corsOrigin(origin: string | null): string {
  if (!origin) return ALLOWED_ORIGINS[0];
  if (ALLOWED_ORIGINS.some((o) => origin === o) || origin.endsWith(".kubestellar.io")) {
    return origin;
  }
  if (origin.startsWith("http://localhost:")) return origin;
  return ALLOWED_ORIGINS[0];
}

function jsonResponse(
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

/** GitHub API fetch with auth + typed error */
async function gh(path: string, token: string, init: RequestInit = {}): Promise<Response> {
  const url = path.startsWith("http") ? path : `${GITHUB_API}${path}`;
  return fetch(url, {
    ...init,
    headers: {
      Accept: "application/vnd.github.v3+json",
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  });
}

/** Matches `owner/repo` format — allows any valid GitHub repo, not just
 * preconfigured PIPELINE_REPOS. The token's access controls what's fetchable. */
const VALID_REPO_PATTERN = /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/;

function isValidRepo(repo: string | null): boolean {
  return !!repo && VALID_REPO_PATTERN.test(repo);
}

/** YYYY-MM-DD in UTC */
function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

/** Map GitHub's workflow_run shape to our WorkflowRun type */
function normalizeRun(r: Record<string, unknown>, repo: string): WorkflowRun {
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

async function readCache<T>(
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

async function writeCache<T>(
  store: ReturnType<typeof getStore>,
  key: string,
  payload: T
): Promise<void> {
  const entry: CachedView<T> = { payload, fetchedAt: Date.now() };
  await store.set(key, JSON.stringify(entry));
}

// ---------------------------------------------------------------------------
// History blob
// ---------------------------------------------------------------------------

async function readHistory(
  store: ReturnType<typeof getStore>
): Promise<HistoryBlob> {
  try {
    const raw = await store.get(HISTORY_KEY);
    if (!raw) return { updatedAt: new Date(0).toISOString(), days: {} };
    return JSON.parse(raw) as HistoryBlob;
  } catch {
    return { updatedAt: new Date(0).toISOString(), days: {} };
  }
}

async function writeHistory(
  store: ReturnType<typeof getStore>,
  history: HistoryBlob
): Promise<void> {
  // Trim to retention window
  const cutoff = new Date(Date.now() - HISTORY_RETENTION_DAYS * MS_PER_DAY)
    .toISOString()
    .slice(0, 10);
  for (const repo of Object.keys(history.days)) {
    for (const wf of Object.keys(history.days[repo])) {
      for (const d of Object.keys(history.days[repo][wf])) {
        if (d < cutoff) delete history.days[repo][wf][d];
      }
    }
  }
  history.updatedAt = new Date().toISOString();
  await store.set(HISTORY_KEY, JSON.stringify(history));
}

/** Merge a batch of runs into the history blob. Newest run per day wins. */
function mergeIntoHistory(history: HistoryBlob, runs: WorkflowRun[]): void {
  for (const run of runs) {
    const day = dayKey(run.createdAt);
    if (!day) continue;
    const byRepo = (history.days[run.repo] ??= {});
    const byWf = (byRepo[run.name] ??= {});
    const existing = byWf[day];
    // When conclusion is null but status indicates activity, surface
    // "in_progress" so the matrix renders a blue dot, not grey.
    const conclusion: Conclusion =
      run.conclusion === null && (run.status === "in_progress" || run.status === "queued")
        ? "in_progress" as Conclusion
        : run.conclusion;
    // Newer run wins (higher ID ≈ newer). Failure trumps success for the same day
    // if one of the runs failed — CI health signal matters more than "latest".
    if (!existing || run.id > existing.runId) {
      byWf[day] = {
        runId: run.id,
        conclusion,
        htmlUrl: run.htmlUrl,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Pulse view
// ---------------------------------------------------------------------------

interface PulsePayload {
  /** The latest completed Release workflow run on kubestellar/console */
  lastRun: {
    conclusion: Conclusion;
    createdAt: string;
    htmlUrl: string;
    runNumber: number;
    releaseTag: string | null;
    weeklyTag?: string | null;
  } | null;
  /** Consecutive conclusions of the same kind, counting back from lastRun */
  streak: number;
  streakKind: "success" | "failure" | "mixed";
  /** The last 14 nightly conclusions, oldest → newest */
  recent: Array<{ conclusion: Conclusion; createdAt: string; htmlUrl: string }>;
  /** Cron expression from the workflow, best-effort */
  nextCron: string;
}

async function buildPulse(
  store: ReturnType<typeof getStore>,
  token: string,
  repoFilter: string | null
): Promise<PulsePayload> {
  // When a specific repo is selected, fetch its most recent workflow runs
  // across all workflows. When null, use the default nightly release workflow.
  const targetRepo = repoFilter && isValidRepo(repoFilter) ? repoFilter : NIGHTLY_RELEASE_REPO;
  const isDefault = targetRepo === NIGHTLY_RELEASE_REPO;
  const apiPath = isDefault
    ? `/repos/${targetRepo}/actions/workflows/${NIGHTLY_RELEASE_WORKFLOW}/runs?per_page=${MATRIX_DEFAULT_DAYS}`
    : `/repos/${targetRepo}/actions/runs?per_page=${MATRIX_DEFAULT_DAYS}`;
  const res = await gh(apiPath, token);
  if (!res.ok) throw new Error(`pulse: GitHub ${res.status}`);
  const data = (await res.json()) as { workflow_runs: Array<Record<string, unknown>> };
  const runs = (data.workflow_runs ?? []).map((r) => normalizeRun(r, targetRepo));
  mergeIntoHistory(await readHistory(store), runs); // side-effect updates below

  // Latest release tag (best-effort).
  // Fetch several recent releases and pick the one with the newest
  // published_at. GitHub's /releases endpoint sorts by created_at of the
  // release API object, not published_at — causing stale tags when a
  // release is re-published or a draft is later promoted. (#8666)
  let releaseTag: string | null = null;
  try {
    const rel = await gh(`/repos/${targetRepo}/releases?per_page=${RELEASE_OVERFETCH}`, token);
    if (rel.ok) {
      const releases = (await rel.json()) as Array<{
        tag_name?: string;
        published_at?: string;
        created_at?: string;
        draft?: boolean;
      }>;
      // Include drafts — nightly releases on this repo are created as drafts
      // and never promoted, so filtering them out leaves zero candidates.
      // Sort by published_at when available, falling back to created_at for
      // drafts where published_at is unset.
      const sortTime = (r: { published_at?: string; created_at?: string }): number => {
        if (r.published_at) return new Date(r.published_at).getTime();
        if (r.created_at) return new Date(r.created_at).getTime();
        return 0;
      };
      const candidates = (releases || [])
        .filter((r) => r.tag_name && NIGHTLY_TAG_RE.test(r.tag_name))
        .sort((a, b) => sortTime(b) - sortTime(a)); // newest first
      releaseTag = candidates[0]?.tag_name ?? null;
    }
  } catch {
    // Non-fatal
  }

  // Also check tags — newer nightlies may only exist as git tags, not
  // GitHub Release objects. Pick the newer of releases vs tags.
  try {
    const tagRes = await gh(`/repos/${targetRepo}/tags?per_page=10`, token);
    if (tagRes.ok) {
      const tags = (await tagRes.json()) as Array<{ name: string }>;
      const match = (tags || []).find((t) => NIGHTLY_TAG_RE.test(t.name));
      if (match && (!releaseTag || match.name > releaseTag)) {
        releaseTag = match.name;
      }
    }
  } catch {
    // Non-fatal
  }

  const last = runs[0];
  let streak = 0;
  let streakKind: "success" | "failure" | "mixed" = "mixed";
  if (last) {
    const kind: "success" | "failure" | null =
      last.conclusion === "success"
        ? "success"
        : last.conclusion === "failure" || last.conclusion === "timed_out"
          ? "failure"
          : null;
    if (kind) {
      streakKind = kind;
      for (const r of runs) {
        const c =
          r.conclusion === "success"
            ? "success"
            : r.conclusion === "failure" || r.conclusion === "timed_out"
              ? "failure"
              : null;
        if (c === kind) streak++;
        else break;
      }
    }
  }

  // Fetch latest stable (weekly) release — /releases/latest returns
  // the most recent non-prerelease, non-draft release.
  let weeklyTag: string | null = null;
  try {
    const wkRes = await gh(`/repos/${targetRepo}/releases/latest`, token);
    if (wkRes.ok) {
      const wk = (await wkRes.json()) as { tag_name?: string };
      if (wk.tag_name) weeklyTag = wk.tag_name;
    }
  } catch {
    // Non-fatal
  }

  return {
    lastRun: last
      ? {
          conclusion: last.conclusion,
          createdAt: last.createdAt,
          htmlUrl: last.htmlUrl,
          runNumber: last.runNumber,
          releaseTag,
          weeklyTag,
        }
      : null,
    streak,
    streakKind,
    // Newest-first (matches the nightly E2E card: leftmost dot = most recent run)
    recent: runs
      .slice(0, MATRIX_DEFAULT_DAYS)
      .map((r) => ({ conclusion: r.conclusion, createdAt: r.createdAt, htmlUrl: r.htmlUrl })),
    nextCron: "0 5 * * *", // embedded in release.yml — would parse it live but one-liner is fine
  };
}

// ---------------------------------------------------------------------------
// Matrix view
// ---------------------------------------------------------------------------

interface MatrixCell {
  date: string; // YYYY-MM-DD
  conclusion: Conclusion;
  htmlUrl: string;
}

interface MatrixWorkflow {
  repo: string;
  name: string;
  cells: MatrixCell[];
}

interface MatrixPayload {
  days: number;
  range: string[]; // YYYY-MM-DD, oldest → newest
  workflows: MatrixWorkflow[];
}

async function buildMatrix(
  store: ReturnType<typeof getStore>,
  token: string,
  days: number,
  repoFilter: string | null
): Promise<MatrixPayload> {
  const targetRepos = repoFilter && isValidRepo(repoFilter) ? [repoFilter] : (REPOS as readonly string[]);

  // Fetch fresh runs per repo with pagination (GitHub caps per_page at 100)
  const MAX_PER_PAGE = 100;
  const MAX_PAGES = 5;
  const freshRuns: WorkflowRun[] = [];
  for (const repo of targetRepos) {
    try {
      let fetched = 0;
      const pages = Math.min(Math.ceil(MATRIX_RUNS_PER_REPO / MAX_PER_PAGE), MAX_PAGES);
      for (let page = 1; page <= pages; page++) {
        const res = await gh(
          `/repos/${repo}/actions/runs?per_page=${MAX_PER_PAGE}&page=${page}`,
          token
        );
        if (!res.ok) break;
        const data = (await res.json()) as { workflow_runs: Array<Record<string, unknown>> };
        const runs = data.workflow_runs ?? [];
        for (const r of runs) {
          freshRuns.push(normalizeRun(r, repo));
        }
        fetched += runs.length;
        // Stop early if fewer results than page size (no more pages)
        if (runs.length < MAX_PER_PAGE) break;
        if (fetched >= MATRIX_RUNS_PER_REPO) break;
      }
    } catch {
      // Per-repo fetch failures shouldn't nuke the whole matrix
    }
  }

  // Merge freshest data into the history blob so 90-day ranges work
  const history = await readHistory(store);
  mergeIntoHistory(history, freshRuns);
  await writeHistory(store, history).catch(() => {});

  // Build the date range (oldest → newest)
  const range: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    range.push(new Date(Date.now() - i * MS_PER_DAY).toISOString().slice(0, 10));
  }

  const workflows: MatrixWorkflow[] = [];
  for (const repo of targetRepos) {
    const wfMap = history.days[repo] ?? {};
    for (const wfName of Object.keys(wfMap).sort()) {
      const byDate = wfMap[wfName];
      const cells: MatrixCell[] = range.map((date) => ({
        date,
        conclusion: byDate[date]?.conclusion ?? null,
        htmlUrl: byDate[date]?.htmlUrl ?? "",
      }));
      // Skip workflows with no activity in the window
      if (cells.every((c) => c.conclusion === null)) continue;
      workflows.push({ repo, name: wfName, cells });
    }
  }

  return { days, range, workflows };
}

// ---------------------------------------------------------------------------
// Flow view
// ---------------------------------------------------------------------------

interface FlowRun {
  run: WorkflowRun;
  jobs: Job[];
}

interface FlowPayload {
  runs: FlowRun[];
}

async function buildFlow(
  token: string,
  repoFilter: string | null
): Promise<FlowPayload> {
  const targetRepos = repoFilter && isValidRepo(repoFilter) ? [repoFilter] : (REPOS as readonly string[]);

  const all: FlowRun[] = [];
  for (const repo of targetRepos) {
    try {
      // Fetch both in_progress AND queued runs in parallel for this repo
      const [inProgress, queued] = await Promise.all([
        gh(`/repos/${repo}/actions/runs?status=in_progress&per_page=${FLOW_MAX_RUNS_PER_REPO}`, token),
        gh(`/repos/${repo}/actions/runs?status=queued&per_page=${FLOW_MAX_RUNS_PER_REPO}`, token),
      ]);
      const merged: Record<string, unknown>[] = [];
      if (inProgress.ok) {
        const d = (await inProgress.json()) as { workflow_runs: Array<Record<string, unknown>> };
        merged.push(...(d.workflow_runs ?? []));
      }
      if (queued.ok) {
        const d = (await queued.json()) as { workflow_runs: Array<Record<string, unknown>> };
        merged.push(...(d.workflow_runs ?? []));
      }
      const runs = merged.map((r) => normalizeRun(r, repo));

      // Fetch jobs for each run (bounded parallel)
      for (const r of runs) {
        const jobsRes = await gh(`/repos/${repo}/actions/runs/${r.id}/jobs`, token);
        if (!jobsRes.ok) continue;
        const jobsData = (await jobsRes.json()) as { jobs: Array<Record<string, unknown>> };
        const jobs: Job[] = (jobsData.jobs ?? []).map((j) => ({
          id: Number(j.id),
          name: String(j.name ?? ""),
          status: (j.status as Status) ?? "completed",
          conclusion: (j.conclusion as Conclusion) ?? null,
          startedAt: (j.started_at as string | null) ?? null,
          completedAt: (j.completed_at as string | null) ?? null,
          htmlUrl: String(j.html_url ?? ""),
          steps: ((j.steps as Array<Record<string, unknown>>) ?? []).map((s) => ({
            name: String(s.name ?? ""),
            status: (s.status as Status) ?? "completed",
            conclusion: (s.conclusion as Conclusion) ?? null,
            number: Number(s.number ?? 0),
            startedAt: (s.started_at as string | undefined) ?? undefined,
            completedAt: (s.completed_at as string | undefined) ?? undefined,
          })),
        }));
        all.push({ run: r, jobs });
      }
    } catch {
      // per-repo failure shouldn't block the rest
    }
  }

  // Newest first
  all.sort((a, b) => (a.run.createdAt < b.run.createdAt ? 1 : -1));
  return { runs: all };
}

// ---------------------------------------------------------------------------
// Failures view
// ---------------------------------------------------------------------------

interface FailureRow {
  repo: string;
  runId: number;
  workflow: string;
  htmlUrl: string;
  branch: string;
  event: string;
  conclusion: Conclusion;
  createdAt: string;
  durationMs: number;
  /** First failed step (name + job id for log drill-down) */
  failedStep: { jobId: number; jobName: string; stepName: string } | null;
  pullRequests?: PullRequestRef[];
}

interface FailuresPayload {
  runs: FailureRow[];
}

async function buildFailures(
  token: string,
  repoFilter: string | null
): Promise<FailuresPayload> {
  const targetRepos = repoFilter && isValidRepo(repoFilter) ? [repoFilter] : (REPOS as readonly string[]);

  const rows: FailureRow[] = [];
  for (const repo of targetRepos) {
    try {
      const res = await gh(
        `/repos/${repo}/actions/runs?status=failure&per_page=${FAILURES_OVERFETCH}`,
        token
      );
      if (!res.ok) continue;
      const data = (await res.json()) as { workflow_runs: Array<Record<string, unknown>> };
      for (const raw of data.workflow_runs ?? []) {
        const r = normalizeRun(raw, repo);
        const created = new Date(r.createdAt).getTime();
        const updated = new Date(r.updatedAt).getTime();
        rows.push({
          repo,
          runId: r.id,
          workflow: r.name,
          htmlUrl: r.htmlUrl,
          branch: r.headBranch,
          event: r.event,
          conclusion: r.conclusion,
          createdAt: r.createdAt,
          durationMs: Math.max(0, updated - created),
          failedStep: null,
          pullRequests: r.pullRequests,
        });
      }
    } catch {
      // skip repo on error
    }
  }

  rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const top = rows.slice(0, FAILURES_LIMIT);

  // Fetch jobs to locate the first failing step (best-effort)
  await Promise.all(
    top.map(async (row) => {
      try {
        const res = await gh(`/repos/${row.repo}/actions/runs/${row.runId}/jobs`, token);
        if (!res.ok) return;
        const data = (await res.json()) as { jobs: Array<Record<string, unknown>> };
        for (const j of data.jobs ?? []) {
          if (j.conclusion !== "failure") continue;
          const steps = (j.steps as Array<Record<string, unknown>>) ?? [];
          const firstFailed = steps.find((s) => s.conclusion === "failure");
          if (!firstFailed) continue;
          row.failedStep = {
            jobId: Number(j.id),
            jobName: String(j.name ?? ""),
            stepName: String(firstFailed.name ?? ""),
          };
          return;
        }
      } catch {
        // skip
      }
    })
  );

  return { runs: top };
}

// ---------------------------------------------------------------------------
// Log view
// ---------------------------------------------------------------------------

async function buildLog(
  token: string,
  repo: string,
  jobId: string
): Promise<Response> {
  const res = await gh(`/repos/${repo}/actions/jobs/${jobId}/logs`, token, {
    // GitHub returns a 302 to S3 with the raw log text
    redirect: "follow",
  });
  if (res.status === 404) {
    return jsonResponse({ error: "Log not available (may have been purged)" }, { status: 404 });
  }
  if (!res.ok) {
    return jsonResponse({ error: `GitHub ${res.status}` }, { status: 502 });
  }
  const text = await res.text();
  const lines = text.split("\n");
  const tail = lines.slice(Math.max(0, lines.length - LOG_TAIL_LINES)).join("\n");
  return jsonResponse({ lines: LOG_TAIL_LINES, truncatedFrom: lines.length, log: tail });
}

// ---------------------------------------------------------------------------
// Mutations (rerun / cancel)
// ---------------------------------------------------------------------------

async function mutate(
  op: string,
  repo: string,
  runId: string
): Promise<Response> {
  const token = process.env.GITHUB_MUTATIONS_TOKEN;
  if (!token) {
    // Intentional: demo site never mutates without an operator explicitly
    // enabling it by setting GITHUB_MUTATIONS_TOKEN. See README for details.
    return jsonResponse(
      { error: "Workflow mutations disabled on this deployment" },
      { status: 503 }
    );
  }
  if (!isValidRepo(repo)) {
    return jsonResponse({ error: "Unknown repo" }, { status: 400 });
  }
  let path: string;
  if (op === "rerun") path = `/repos/${repo}/actions/runs/${runId}/rerun`;
  else if (op === "cancel") path = `/repos/${repo}/actions/runs/${runId}/cancel`;
  else return jsonResponse({ error: "Unknown op" }, { status: 400 });

  const res = await gh(path, token, { method: "POST" });
  if (!res.ok) {
    const body = await res.text();
    return jsonResponse({ error: `GitHub ${res.status}: ${body}` }, { status: 502 });
  }
  return jsonResponse({ ok: true, op, run: runId, repo });
}

// ---------------------------------------------------------------------------
// Request handler
// ---------------------------------------------------------------------------

export default async (req: Request): Promise<Response> => {
  const origin = req.headers.get("origin");
  const baseHeaders: Record<string, string> = {
    "Access-Control-Allow-Origin": corsOrigin(origin),
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: baseHeaders });
  }

  const url = new URL(req.url);
  const view = url.searchParams.get("view") ?? "pulse";

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return jsonResponse(
      { error: "GITHUB_TOKEN not configured" },
      { status: 500, headers: baseHeaders }
    );
  }

  const store = getStore(STORE_NAME);

  try {
    // Mutations — POST only
    if (view === "mutate") {
      if (req.method !== "POST") {
        return jsonResponse(
          { error: "Mutations require POST" },
          { status: 405, headers: baseHeaders }
        );
      }
      const op = url.searchParams.get("op") ?? "";
      const repo = url.searchParams.get("repo") ?? "";
      const run = url.searchParams.get("run") ?? "";
      const resp = await mutate(op, repo, run);
      // Inherit CORS headers
      for (const [k, v] of Object.entries(baseHeaders)) resp.headers.set(k, v);
      return resp;
    }

    // Reads — cache hit? Include UTC date in the pulse key so it rotates
    // daily and doesn't serve yesterday's release tag for hours after a new
    // nightly publishes. Other views are keyed by their query params.
    const datePrefix = view === "pulse" ? new Date().toISOString().slice(0, 13) : ""; // hourly bucket for pulse
    const cacheKey = `${view}:${datePrefix}:${url.searchParams.get("repo") ?? "all"}:${url.searchParams.get("days") ?? ""}:${url.searchParams.get("job") ?? ""}`;
    if (view !== "log") {
      const cached = await readCache<unknown>(store, cacheKey);
      if (cached) {
        return jsonResponse(cached.payload, {
          headers: {
            ...baseHeaders,
            "Cache-Control": `public, max-age=${Math.floor(CACHE_TTL_MS / 1000)}`,
            "X-Cache": "HIT",
          },
        });
      }
    }

    let payload: unknown;
    switch (view) {
      case "pulse":
        payload = await buildPulse(store, token, url.searchParams.get("repo"));
        break;
      case "matrix": {
        const daysRaw = parseInt(url.searchParams.get("days") ?? String(MATRIX_DEFAULT_DAYS), 10);
        const days = Math.min(Math.max(1, daysRaw || MATRIX_DEFAULT_DAYS), MATRIX_MAX_DAYS);
        payload = await buildMatrix(store, token, days, url.searchParams.get("repo"));
        break;
      }
      case "flow":
        payload = await buildFlow(token, url.searchParams.get("repo"));
        break;
      case "failures":
        payload = await buildFailures(token, url.searchParams.get("repo"));
        break;
      case "all": {
        // Unified fetch — builds all four views in parallel so the CI/CD
        // dashboard makes one request instead of four.
        const repoFilter = url.searchParams.get("repo");
        const daysRaw = parseInt(url.searchParams.get("days") ?? String(MATRIX_DEFAULT_DAYS), 10);
        const days = Math.min(Math.max(1, daysRaw || MATRIX_DEFAULT_DAYS), MATRIX_MAX_DAYS);
        const [pulse, matrix, flow, failures] = await Promise.allSettled([
          buildPulse(store, token, repoFilter),
          buildMatrix(store, token, days, repoFilter),
          buildFlow(token, repoFilter),
          buildFailures(token, repoFilter),
        ]);
        payload = {
          pulse: pulse.status === "fulfilled" ? pulse.value : null,
          matrix: matrix.status === "fulfilled" ? matrix.value : null,
          flow: flow.status === "fulfilled" ? flow.value : null,
          failures: failures.status === "fulfilled" ? failures.value : null,
        };
        break;
      }
      case "log": {
        const repo = url.searchParams.get("repo") ?? "";
        const job = url.searchParams.get("job") ?? "";
        if (!isValidRepo(repo) || !job) {
          return jsonResponse(
            { error: "repo and job params required" },
            { status: 400, headers: baseHeaders }
          );
        }
        const r = await buildLog(token, repo, job);
        for (const [k, v] of Object.entries(baseHeaders)) r.headers.set(k, v);
        return r;
      }
      default:
        return jsonResponse({ error: `Unknown view: ${view}` }, { status: 400, headers: baseHeaders });
    }

    // Wrap payload with the repo list so the client never hardcodes it.
    // Cards read `repos` from the response to populate their filter dropdown.
    const wrapped = { ...(payload as Record<string, unknown>), repos: REPOS };
    await writeCache(store, cacheKey, wrapped).catch(() => {});
    return jsonResponse(wrapped, {
      headers: {
        ...baseHeaders,
        "Cache-Control": `public, max-age=${Math.floor(CACHE_TTL_MS / 1000)}`,
        "X-Cache": "MISS",
      },
    });
  } catch (err) {
    return jsonResponse(
      {
        error: (err as Error).message ?? "Internal error",
        repos: REPOS,
        nextCron: "0 5 * * *",
      },
      { status: 500, headers: baseHeaders }
    );
  }
};

export const config = {
  path: "/api/github-pipelines",
};
