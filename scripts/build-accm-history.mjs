#!/usr/bin/env node
/**
 * build-accm-history.mjs
 *
 * Computes the full ACCM (AI Codebase Maturity Model) historical dataset for
 * kubestellar/console from PROJECT_START_DATE to today, and emits the result
 * as a single JSON document on stdout.
 *
 * Why this script exists:
 *   The GitHub Search API caps results at 1000 per query. Once the project
 *   has >1000 PRs+issues in a window, the older entries get truncated and
 *   the chart shows zeros for early weeks. We work around this by slicing
 *   the time range into MONTHLY windows; each window stays well under the
 *   1000-result cap so we get every PR and every issue.
 *
 * Output shape matches the existing Netlify Function (analytics-accm.mts) so
 * the frontend (web/public/analytics.js) can consume it unchanged.
 *
 * Usage:
 *   GH_TOKEN=ghp_... node scripts/build-accm-history.mjs > accm-history.json
 *
 * Run from a GitHub Actions workflow on a daily cron to keep the public
 * dataset fresh. See .github/workflows/accm-history-update.yml.
 */

const REPO = "kubestellar/console";
const GITHUB_API = "https://api.github.com";

/** Project start — first commit / first PR. Anchors the history window. */
const PROJECT_START_DATE = "2026-01-16";
/** Per-page result count (GitHub max). */
const PER_PAGE = 100;
/** Hard cap on pages per slice; 10 pages × 100 = 1000 (GitHub Search ceiling). */
const MAX_PAGES_PER_SLICE = 10;
/** AI-generated label used to classify AI contributions. */
const AI_LABEL = "ai-generated";
/**
 * Authors whose PRs/issues are always classified as AI.
 *   - clubanderson: the shared login Claude Code writes from
 *   - Copilot / copilot-swe-agent[bot]: GitHub Copilot coding agent
 * Any login ending in `[bot]` is also treated as AI (see isAIContribution).
 */
const AI_AUTHORS = new Set([
  "clubanderson",
  "Copilot",
  "copilot-swe-agent[bot]",
]);
/** Workflow filenames to track for CI pass rates. */
const CI_WORKFLOWS = {
  coverage: "Coverage Suite",
  nightly: "Nightly Compliance & Perf",
};
/** Maximum CI runs to fetch per workflow (paginated). */
const MAX_CI_PAGES = 30;

const TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || "";
if (!TOKEN) {
  console.error("ERROR: GH_TOKEN or GITHUB_TOKEN must be set");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isoWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

/** All ISO week strings between two dates inclusive (in chronological order). */
function weeksBetween(startDate, endDate) {
  const weeks = [];
  const seen = new Set();
  const cursor = new Date(startDate);
  while (cursor <= endDate) {
    const w = isoWeek(cursor);
    if (!seen.has(w)) {
      seen.add(w);
      weeks.push(w);
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return weeks;
}

/** Days per slice — chosen so that even the busiest week stays under the
 *  1000-result GitHub Search hard cap. At ~250 PRs/week we can comfortably
 *  use 7 days; we use 7 here and verify in main() that no slice maxed out. */
const SLICE_DAYS = 7;

/** Yields [start, end] date pairs covering each SLICE_DAYS-day window from
 *  startDate to endDate inclusive. Each slice is small enough to stay under
 *  the 1000-result GitHub Search hard cap even on the busiest weeks. */
function* dateSlices(startDate, endDate) {
  let cursor = new Date(startDate);
  while (cursor <= endDate) {
    const sliceStart = new Date(cursor);
    const sliceEnd = new Date(cursor);
    sliceEnd.setUTCDate(sliceEnd.getUTCDate() + SLICE_DAYS - 1);
    sliceEnd.setUTCHours(23, 59, 59, 999);
    if (sliceEnd > endDate) sliceEnd.setTime(endDate.getTime());
    yield [sliceStart, sliceEnd];
    cursor.setUTCDate(cursor.getUTCDate() + SLICE_DAYS);
  }
}

function ymd(d) {
  return d.toISOString().split("T")[0];
}

/** Sleep promisified. */
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** GitHub fetch with automatic retry on 403/429 (rate limit). Honours
 *  the X-RateLimit-Reset and Retry-After headers. */
async function ghFetch(url, attempt = 1) {
  const res = await fetch(url, {
    headers: {
      Accept: "application/vnd.github.v3+json",
      Authorization: `Bearer ${TOKEN}`,
      "User-Agent": "kubestellar-accm-history-builder",
    },
  });
  if (res.status === 403 || res.status === 429) {
    const retryAfter = res.headers.get("retry-after");
    const reset = res.headers.get("x-ratelimit-reset");
    let waitMs = 30_000;
    if (retryAfter) waitMs = Math.max(waitMs, parseInt(retryAfter, 10) * 1000);
    if (reset) {
      const resetMs = parseInt(reset, 10) * 1000 - Date.now();
      if (resetMs > 0) waitMs = Math.max(waitMs, resetMs + 1000);
    }
    if (attempt > 5) {
      const body = await res.text();
      throw new Error(`GitHub API ${res.status} after 5 retries for ${url}: ${body.slice(0, 200)}`);
    }
    process.stderr.write(`  rate-limited, sleeping ${Math.round(waitMs / 1000)}s (attempt ${attempt})\n`);
    await sleep(waitMs);
    return ghFetch(url, attempt + 1);
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub API ${res.status} for ${url}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

/** Paginated search query. Stops when fewer than PER_PAGE items returned.
 *  Returns { items, hitCap } so callers can warn when a slice maxed out
 *  (which means data is being silently truncated and the slice window
 *  needs to be smaller). */
async function searchPaginated(query) {
  const items = [];
  let hitCap = false;
  for (let page = 1; page <= MAX_PAGES_PER_SLICE; page++) {
    const url = `${GITHUB_API}/search/issues?q=${encodeURIComponent(query)}&per_page=${PER_PAGE}&page=${page}&sort=created&order=asc`;
    const body = await ghFetch(url);
    const slice = body.items || [];
    items.push(...slice);
    if (slice.length < PER_PAGE) break;
    if (page === MAX_PAGES_PER_SLICE) hitCap = true;
    // Be polite — GitHub Search is rate-limited at 30/min for authenticated users
    await sleep(2200); // GitHub Search is rate-limited at 30/min — pace at ~27/min
  }
  return { items, hitCap };
}

// ---------------------------------------------------------------------------
// Fetchers — monthly windowed
// ---------------------------------------------------------------------------

async function fetchAllPRs(startDate, endDate) {
  const all = [];
  let cappedSlices = 0;
  for (const [s, e] of dateSlices(startDate, endDate)) {
    const q = `repo:${REPO} type:pr created:${ymd(s)}..${ymd(e)}`;
    const { items, hitCap } = await searchPaginated(q);
    process.stderr.write(`  PRs ${ymd(s)}..${ymd(e)}: ${items.length}${hitCap ? " [CAP]" : ""}\n`);
    if (hitCap) cappedSlices++;
    for (const item of items) {
      all.push({
        created_at: item.created_at,
        merged_at: item.pull_request?.merged_at ?? null,
        user: { login: item.user?.login || "" },
        labels: item.labels || [],
      });
    }
  }
  if (cappedSlices > 0) {
    process.stderr.write(`WARNING: ${cappedSlices} PR slice(s) hit the 1000-result cap — shrink SLICE_DAYS\n`);
  }
  return all;
}

async function fetchAllIssues(startDate, endDate) {
  const all = [];
  let cappedSlices = 0;
  for (const [s, e] of dateSlices(startDate, endDate)) {
    const q = `repo:${REPO} type:issue created:${ymd(s)}..${ymd(e)}`;
    const { items, hitCap } = await searchPaginated(q);
    if (hitCap) cappedSlices++;
    const filtered = items.filter((item) => !item.pull_request);
    process.stderr.write(`  Issues ${ymd(s)}..${ymd(e)}: ${filtered.length}${hitCap ? " [CAP]" : ""}\n`);
    for (const item of filtered) {
      all.push({
        created_at: item.created_at,
        closed_at: item.closed_at ?? null,
        user: { login: item.user?.login || "" },
        labels: item.labels || [],
      });
    }
  }
  if (cappedSlices > 0) {
    process.stderr.write(`WARNING: ${cappedSlices} issue slice(s) hit the 1000-result cap — shrink SLICE_DAYS\n`);
  }
  return all;
}

async function fetchCIWorkflowRuns(workflowName) {
  const listUrl = `${GITHUB_API}/repos/${REPO}/actions/workflows`;
  const list = await ghFetch(listUrl);
  const workflow = (list.workflows || []).find(
    (w) => w.name.toLowerCase() === workflowName.toLowerCase(),
  );
  if (!workflow) {
    process.stderr.write(`  Workflow not found: ${workflowName}\n`);
    return [];
  }
  const runs = [];
  for (let page = 1; page <= MAX_CI_PAGES; page++) {
    const url = `${GITHUB_API}/repos/${REPO}/actions/workflows/${workflow.id}/runs?per_page=${PER_PAGE}&page=${page}&status=completed`;
    const body = await ghFetch(url);
    const slice = body.workflow_runs || [];
    runs.push(...slice);
    if (slice.length < PER_PAGE) break;
    await new Promise((r) => setTimeout(r, 300));
  }
  process.stderr.write(`  CI runs ${workflowName}: ${runs.length}\n`);
  return runs.map((r) => ({
    created_at: r.created_at,
    conclusion: r.conclusion,
    status: r.status,
  }));
}

// ---------------------------------------------------------------------------
// Aggregation — same logic as analytics-accm.mts
// ---------------------------------------------------------------------------

function isAIContribution(labels, author) {
  if (AI_AUTHORS.has(author)) return true;
  if (author && author.endsWith("[bot]")) return true;
  return (labels || []).some((l) => l.name === AI_LABEL);
}

function aggregateWeeklyActivity(prs, issues, weeks) {
  const buckets = new Map();
  for (const week of weeks) {
    buckets.set(week, {
      week,
      prsOpened: 0,
      prsMerged: 0,
      issuesOpened: 0,
      issuesClosed: 0,
      aiPrs: 0,
      humanPrs: 0,
      aiIssues: 0,
      humanIssues: 0,
      uniqueContributors: 0,
    });
  }

  const weeksSet = new Set(weeks);
  const contributorsByWeek = new Map();

  for (const pr of prs) {
    const w = isoWeek(new Date(pr.created_at));
    if (!weeksSet.has(w)) continue;
    const b = buckets.get(w);
    b.prsOpened++;
    if (pr.merged_at) {
      const wm = isoWeek(new Date(pr.merged_at));
      if (weeksSet.has(wm)) buckets.get(wm).prsMerged++;
    }
    if (isAIContribution(pr.labels, pr.user.login)) b.aiPrs++;
    else b.humanPrs++;

    if (!contributorsByWeek.has(w)) contributorsByWeek.set(w, new Set());
    contributorsByWeek.get(w).add(pr.user.login);
  }

  for (const issue of issues) {
    const w = isoWeek(new Date(issue.created_at));
    if (!weeksSet.has(w)) continue;
    const b = buckets.get(w);
    b.issuesOpened++;
    if (issue.closed_at) {
      const wc = isoWeek(new Date(issue.closed_at));
      if (weeksSet.has(wc)) buckets.get(wc).issuesClosed++;
    }
    if (isAIContribution(issue.labels, issue.user.login)) b.aiIssues++;
    else b.humanIssues++;

    if (!contributorsByWeek.has(w)) contributorsByWeek.set(w, new Set());
    contributorsByWeek.get(w).add(issue.user.login);
  }

  for (const week of weeks) {
    const b = buckets.get(week);
    b.uniqueContributors = contributorsByWeek.get(week)?.size || 0;
  }

  return weeks.map((w) => buckets.get(w));
}

function aggregateCIPassRates(coverageRuns, nightlyRuns, weeks) {
  function bucket(runs) {
    const m = new Map();
    for (const w of weeks) m.set(w, { total: 0, passed: 0, rate: 0 });
    for (const r of runs) {
      const w = isoWeek(new Date(r.created_at));
      if (!m.has(w)) continue;
      const b = m.get(w);
      b.total++;
      if (r.conclusion === "success") b.passed++;
    }
    for (const b of m.values()) b.rate = b.total > 0 ? Math.round((b.passed / b.total) * 100) : 0;
    return m;
  }
  const cov = bucket(coverageRuns);
  const nig = bucket(nightlyRuns);
  return weeks.map((week) => ({
    week,
    coverage: cov.get(week),
    nightly: nig.get(week),
  }));
}

function aggregateContributorGrowth(prs, issues, weeks) {
  const allContributors = new Set();
  const firstSeenByUser = new Map();

  for (const item of [...prs, ...issues]) {
    const login = item.user.login;
    if (!login) continue;
    allContributors.add(login);
    const created = new Date(item.created_at);
    if (!firstSeenByUser.has(login) || created < firstSeenByUser.get(login)) {
      firstSeenByUser.set(login, created);
    }
  }

  const newByWeek = new Map();
  for (const w of weeks) newByWeek.set(w, 0);
  for (const [, firstSeen] of firstSeenByUser) {
    const w = isoWeek(firstSeen);
    if (newByWeek.has(w)) newByWeek.set(w, newByWeek.get(w) + 1);
  }

  let running = 0;
  const weekly = weeks.map((week) => {
    const newContributors = newByWeek.get(week) || 0;
    running += newContributors;
    return { week, newContributors, totalToDate: running };
  });

  return { total: allContributors.size, weekly };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const start = new Date(`${PROJECT_START_DATE}T00:00:00Z`);
  const end = new Date();
  const weeks = weeksBetween(start, end);
  process.stderr.write(`Building ACCM history: ${PROJECT_START_DATE} -> ${ymd(end)} (${weeks.length} weeks)\n`);

  process.stderr.write("Fetching PRs...\n");
  const prs = await fetchAllPRs(start, end);
  process.stderr.write(`Total PRs: ${prs.length}\n`);

  process.stderr.write("Fetching issues...\n");
  const issues = await fetchAllIssues(start, end);
  process.stderr.write(`Total issues: ${issues.length}\n`);

  process.stderr.write("Fetching CI runs...\n");
  const coverageRuns = await fetchCIWorkflowRuns(CI_WORKFLOWS.coverage);
  const nightlyRuns = await fetchCIWorkflowRuns(CI_WORKFLOWS.nightly);

  const weeklyActivity = aggregateWeeklyActivity(prs, issues, weeks);
  const ciPassRates = aggregateCIPassRates(coverageRuns, nightlyRuns, weeks);
  const contributorGrowth = aggregateContributorGrowth(prs, issues, weeks);

  const out = {
    weeklyActivity,
    ciPassRates,
    contributorGrowth,
    cachedAt: new Date().toISOString(),
    projectStartDate: PROJECT_START_DATE,
    weekCount: weeks.length,
  };

  process.stdout.write(JSON.stringify(out, null, 2) + "\n");
  process.stderr.write(`Done. ${weeks.length} weeks, ${prs.length} PRs, ${issues.length} issues, ${contributorGrowth.total} contributors.\n`);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
