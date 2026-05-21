/**
 * View builders for GitHub Pipelines Dashboard
 */
import type { getStore } from "@netlify/blobs";
import type {
  PulsePayload,
  MatrixPayload,
  MatrixWorkflow,
  MatrixCell,
  FlowPayload,
  FlowRun,
  FailuresPayload,
  FailureRow,
  WorkflowRun,
  Job,
  Status,
  Conclusion,
} from "./types";
import {
  NIGHTLY_RELEASE_REPO,
  NIGHTLY_RELEASE_WORKFLOW,
  MATRIX_DEFAULT_DAYS,
  RELEASE_OVERFETCH,
  NIGHTLY_TAG_RE,
  MATRIX_RUNS_PER_REPO,
  MS_PER_DAY,
  getRepos,
  FLOW_MAX_RUNS_PER_REPO,
  FAILURES_OVERFETCH,
  FAILURES_LIMIT,
  LOG_TAIL_LINES,
} from "./constants";
import { gh, readCappedJson, readCappedText } from "./fetchers";
import { isValidRepo, jsonResponse } from "./helpers";
import { normalizeRun } from "./transform";
import { readHistory, writeHistory, mergeIntoHistory } from "./history";

const REPOS = getRepos();

// ---------------------------------------------------------------------------
// Pulse view
// ---------------------------------------------------------------------------

export async function buildPulse(
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
  const data = await readCappedJson<{ workflow_runs: Array<Record<string, unknown>> }>(res);
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
      const releases = await readCappedJson<Array<{
        tag_name?: string;
        published_at?: string;
        created_at?: string;
        draft?: boolean;
      }>>(rel);
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
      const tags = await readCappedJson<Array<{ name: string }>>(tagRes);
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
      const wk = await readCappedJson<{ tag_name?: string }>(wkRes);
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

export async function buildMatrix(
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
        const data = await readCappedJson<{ workflow_runs: Array<Record<string, unknown>> }>(res);
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
  await writeHistory(store, history).catch((err) => { console.warn("[github-pipelines] history write failed:", err instanceof Error ? err.message : err) });

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

export async function buildFlow(
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
        const d = await readCappedJson<{ workflow_runs: Array<Record<string, unknown>> }>(inProgress);
        merged.push(...(d.workflow_runs ?? []));
      }
      if (queued.ok) {
        const d = await readCappedJson<{ workflow_runs: Array<Record<string, unknown>> }>(queued);
        merged.push(...(d.workflow_runs ?? []));
      }
      const runs = merged.map((r) => normalizeRun(r, repo));

      // Fetch jobs for each run (bounded parallel)
      for (const r of runs) {
        const jobsRes = await gh(`/repos/${repo}/actions/runs/${r.id}/jobs`, token);
        if (!jobsRes.ok) continue;
        const jobsData = await readCappedJson<{ jobs: Array<Record<string, unknown>> }>(jobsRes);
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

export async function buildFailures(
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
      const data = await readCappedJson<{ workflow_runs: Array<Record<string, unknown>> }>(res);
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
        const data = await readCappedJson<{ jobs: Array<Record<string, unknown>> }>(res);
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

export async function buildLog(
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
    return jsonResponse({ error: "upstream request failed" }, { status: 502 });
  }
  const text = await readCappedText(res);
  const lines = text.split("\n");
  const tail = lines.slice(Math.max(0, lines.length - LOG_TAIL_LINES)).join("\n");
  return jsonResponse({ lines: LOG_TAIL_LINES, truncatedFrom: lines.length, log: tail });
}
