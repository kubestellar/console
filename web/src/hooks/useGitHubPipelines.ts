/**
 * useGitHubPipelines — shared data hooks for the /ci-cd pipeline cards.
 *
 * Each view calls the `/api/github-pipelines` Netlify Function, which
 * caches GitHub API responses in Netlify Blobs so the public demo site
 * never hits GitHub's per-IP rate limit. The function also works in demo
 * mode (no auth), so these hooks pass `liveInDemoMode: true`.
 */
import { useCallback } from 'react'
import { useCache } from '../lib/cache'

/** Client-side poll interval for the live flow card — matches Drasi's cadence */
const FLOW_POLL_MS = 10_000
/** Poll interval for GitHub pipeline data. Hourly to stay within
 *  GitHub's rate limits. Manual refresh button still works instantly. */
const DEFAULT_POLL_MS = 3_600_000
/** Timeout for any /api/github-pipelines fetch */
const FETCH_TIMEOUT_MS = 10_000

/** Fallback repos used in demo mode before the first server response arrives.
 * The server is the single source of truth — it reads PIPELINE_REPOS env var
 * and returns the live list in every response under the `repos` field.
 * Cards read repos from the response to populate their filter dropdown. */
const FALLBACK_REPOS = [
  'kubestellar/console',
  'kubestellar/docs',
  'kubestellar/console-kb',
  'kubestellar/kubestellar-mcp',
  'kubestellar/console-marketplace',
  'kubestellar/homebrew-tap',
]

/** Last-known repo list from the server. Updated on every successful fetch.
 * Cards call `getPipelineRepos()` to get the current list for their dropdown. */
let serverRepos: string[] = FALLBACK_REPOS

/** Returns the current repo list. After the first successful fetch, this
 * reflects whatever the server's PIPELINE_REPOS env var is set to. */
export function getPipelineRepos(): string[] {
  return serverRepos
}

export type Conclusion =
  | 'success'
  | 'failure'
  | 'cancelled'
  | 'skipped'
  | 'timed_out'
  | 'action_required'
  | 'neutral'
  | 'stale'
  | null

export type Status = 'queued' | 'in_progress' | 'completed' | 'waiting' | 'pending'

// ---------------------------------------------------------------------------
// Shapes (mirror the Netlify Function; keep in sync)
// ---------------------------------------------------------------------------

export interface PulsePayload {
  lastRun: {
    conclusion: Conclusion
    createdAt: string
    htmlUrl: string
    runNumber: number
    releaseTag: string | null
    weeklyTag?: string | null
  } | null
  streak: number
  streakKind: 'success' | 'failure' | 'mixed'
  recent: Array<{ conclusion: Conclusion; createdAt: string; htmlUrl: string }>
  nextCron: string
}

export interface MatrixCell {
  date: string
  conclusion: Conclusion
  htmlUrl: string
}

export interface MatrixWorkflow {
  repo: string
  name: string
  cells: MatrixCell[]
}

export interface MatrixPayload {
  days: number
  range: string[]
  workflows: MatrixWorkflow[]
}

export interface FlowStep {
  name: string
  status: Status
  conclusion: Conclusion
  number: number
  startedAt?: string
  completedAt?: string
}

export interface FlowJob {
  id: number
  name: string
  status: Status
  conclusion: Conclusion
  startedAt: string | null
  completedAt: string | null
  htmlUrl: string
  steps: FlowStep[]
}

/** Compact PR reference forwarded from the GitHub Actions API. */
export interface PullRequestRef {
  number: number
  url: string
}

export interface FlowRun {
  run: {
    id: number
    repo: string
    name: string
    headBranch: string
    status: Status
    conclusion: Conclusion
    event: string
    runNumber: number
    htmlUrl: string
    createdAt: string
    updatedAt: string
    pullRequests?: PullRequestRef[]
  }
  jobs: FlowJob[]
}

export interface FlowPayload {
  runs: FlowRun[]
}

export interface FailureRow {
  repo: string
  runId: number
  workflow: string
  htmlUrl: string
  branch: string
  event: string
  conclusion: Conclusion
  createdAt: string
  durationMs: number
  failedStep: { jobId: number; jobName: string; stepName: string } | null
  pullRequests?: PullRequestRef[]
}

export interface FailuresPayload {
  runs: FailureRow[]
}

// ---------------------------------------------------------------------------
// Demo fixtures (used when /api/github-pipelines is unreachable in dev or
// when a deployment hasn't configured GITHUB_TOKEN yet)
// ---------------------------------------------------------------------------

const DEMO_REPO = 'kubestellar/console'
const dayOffset = (days: number): string =>
  new Date(Date.now() - days * 86_400_000).toISOString()

export const DEMO_PULSE: PulsePayload = {
  lastRun: {
    conclusion: 'success',
    createdAt: dayOffset(0),
    htmlUrl: '#',
    runNumber: 128,
    releaseTag: 'v0.3.21-nightly.20260416',
    weeklyTag: 'v0.3.20',
  },
  streak: 3,
  streakKind: 'success',
  recent: [
    { conclusion: 'failure', createdAt: dayOffset(13), htmlUrl: '#' },
    { conclusion: 'failure', createdAt: dayOffset(12), htmlUrl: '#' },
    { conclusion: 'failure', createdAt: dayOffset(11), htmlUrl: '#' },
    { conclusion: 'failure', createdAt: dayOffset(10), htmlUrl: '#' },
    { conclusion: 'success', createdAt: dayOffset(9), htmlUrl: '#' },
    { conclusion: 'success', createdAt: dayOffset(8), htmlUrl: '#' },
    { conclusion: 'success', createdAt: dayOffset(7), htmlUrl: '#' },
    { conclusion: 'cancelled', createdAt: dayOffset(6), htmlUrl: '#' },
    { conclusion: 'success', createdAt: dayOffset(5), htmlUrl: '#' },
    { conclusion: 'success', createdAt: dayOffset(4), htmlUrl: '#' },
    { conclusion: 'failure', createdAt: dayOffset(3), htmlUrl: '#' },
    { conclusion: 'success', createdAt: dayOffset(2), htmlUrl: '#' },
    { conclusion: 'success', createdAt: dayOffset(1), htmlUrl: '#' },
    { conclusion: 'success', createdAt: dayOffset(0), htmlUrl: '#' },
  ],
  nextCron: '0 5 * * *',
}

const DEMO_WORKFLOW_NAMES = [
  'Release',
  'Build and Deploy KC',
  'Go Tests',
  'fullstack-e2e',
  'Nightly Test Suite',
  'CodeQL',
  'ui-ux-standard',
]

const DEMO_MATRIX_DAYS = 14

function buildDemoMatrix(days: number): MatrixPayload {
  const range: string[] = []
  for (let i = days - 1; i >= 0; i--) {
    range.push(new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10))
  }
  // Deterministic pattern seeded from workflow name + day for the demo
  const hash = (s: string) => {
    let h = 0
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
    return Math.abs(h)
  }
  const workflows: MatrixWorkflow[] = DEMO_WORKFLOW_NAMES.map((name) => ({
    repo: DEMO_REPO,
    name,
    cells: range.map((date) => {
      const n = hash(name + date) % 10
      const conclusion: Conclusion =
        n < 7 ? 'success' : n === 7 ? 'failure' : n === 8 ? 'cancelled' : null
      return { date, conclusion, htmlUrl: '#' }
    }),
  }))
  return { days, range, workflows }
}

export const DEMO_MATRIX: MatrixPayload = buildDemoMatrix(DEMO_MATRIX_DAYS)

export const DEMO_FLOW: FlowPayload = {
  runs: [
    {
      run: {
        id: 99999001,
        repo: DEMO_REPO,
        name: 'Go Tests',
        headBranch: 'feat/pipeline-dashboard',
        status: 'in_progress',
        conclusion: null,
        event: 'pull_request',
        runNumber: 457,
        htmlUrl: '#',
        createdAt: new Date(Date.now() - 120_000).toISOString(),
        updatedAt: new Date().toISOString(),
        pullRequests: [{ number: 8630, url: '#' }],
      },
      jobs: [
        {
          id: 1001,
          name: 'go test ./...',
          status: 'in_progress',
          conclusion: null,
          startedAt: new Date(Date.now() - 90_000).toISOString(),
          completedAt: null,
          htmlUrl: '#',
          steps: [
            { name: 'Checkout', status: 'completed', conclusion: 'success', number: 1 },
            { name: 'Set up Go', status: 'completed', conclusion: 'success', number: 2 },
            { name: 'Run full Go test suite', status: 'in_progress', conclusion: null, number: 3 },
          ],
        },
      ],
    },
  ],
}

export const DEMO_FAILURES: FailuresPayload = {
  runs: [
    {
      repo: DEMO_REPO,
      runId: 99990001,
      workflow: 'Release',
      htmlUrl: '#',
      branch: 'main',
      event: 'schedule',
      conclusion: 'failure',
      createdAt: new Date(Date.now() - 4 * 86_400_000).toISOString(),
      durationMs: 187_000,
      failedStep: { jobId: 1, jobName: 'test', stepName: 'Run Go tests' },
    },
    {
      repo: DEMO_REPO,
      runId: 99990002,
      workflow: 'fullstack-e2e',
      htmlUrl: '#',
      branch: 'main',
      event: 'push',
      conclusion: 'failure',
      createdAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
      durationMs: 612_000,
      failedStep: { jobId: 2, jobName: 'e2e', stepName: 'Run Playwright tests' },
      pullRequests: [{ number: 8625, url: '#' }],
    },
    {
      repo: 'kubestellar/docs',
      runId: 99990003,
      workflow: 'Deploy docs',
      htmlUrl: '#',
      branch: 'main',
      event: 'push',
      conclusion: 'failure',
      createdAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
      durationMs: 95_000,
      failedStep: { jobId: 3, jobName: 'build', stepName: 'Build MkDocs' },
      pullRequests: [{ number: 1205, url: '#' }],
    },
  ],
}

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

async function fetchView<T>(params: URLSearchParams): Promise<T> {
  const url = `/api/github-pipelines?${params.toString()}`
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const body = (await res.json()) as T & { repos?: string[] }
  // Update the shared repo list from the server response — this is the
  // single source of truth for which repos the backend is configured to
  // scan (set via PIPELINE_REPOS env var).
  if (Array.isArray(body.repos) && body.repos.length > 0) {
    serverRepos = body.repos
  }
  return body
}

// ---------------------------------------------------------------------------
// Unified payload — returned by view=all, consumed by PipelineDataContext
// ---------------------------------------------------------------------------

export interface UnifiedPipelinePayload {
  pulse: PulsePayload | null
  matrix: MatrixPayload | null
  failures: FailuresPayload | null
  flow: FlowPayload | null
}

/** Shared data shape exposed via PipelineDataContext to all pipeline cards. */
export interface UnifiedPipelineData {
  pulse: PulsePayload
  matrix: MatrixPayload
  failures: FailuresPayload
  flow: FlowPayload
  isLoading: boolean
  isRefreshing: boolean
  error: string | null
  isFailed: boolean
  lastRefresh: number | null
  refetch: () => Promise<void>
}

// ---------------------------------------------------------------------------
// Hooks — unified + per-view
// ---------------------------------------------------------------------------

/** Matrix days default for the unified fetch — matches the default individual hooks use. */
const UNIFIED_MATRIX_DAYS = 14

/**
 * useUnifiedPipelineData — fetches all four pipeline views in one request.
 * Used by PipelineDataProvider on the CI/CD dashboard so cards share data.
 */
export function useUnifiedPipelineData(repo: string | null, days: number = UNIFIED_MATRIX_DAYS) {
  const demoMatrix = days === DEMO_MATRIX_DAYS ? DEMO_MATRIX : buildDemoMatrix(days)
  const initialData: UnifiedPipelinePayload = {
    pulse: DEMO_PULSE,
    matrix: demoMatrix,
    failures: DEMO_FAILURES,
    flow: DEMO_FLOW,
  }
  return useCache<UnifiedPipelinePayload>({
    key: `gh-pipelines-all:${repo ?? 'all'}:${days}`,
    category: 'default',
    refreshInterval: DEFAULT_POLL_MS,
    initialData,
    demoData: initialData,
    liveInDemoMode: true,
    fetcher: () => {
      const p = new URLSearchParams({ view: 'all', days: String(days) })
      if (repo) p.set('repo', repo)
      return fetchView<UnifiedPipelinePayload>(p)
    },
  })
}

/**
 * Individual view hooks. Each accepts an optional `enabled` flag (default true).
 * When the card is inside a PipelineDataProvider, it passes `enabled: false` to
 * suppress the individual fetch and reads shared data from the context instead.
 */

export function usePipelinePulse(repo: string | null, enabled = true) {
  return useCache<PulsePayload>({
    key: `gh-pipelines-pulse:${repo ?? 'all'}`,
    category: 'default',
    refreshInterval: DEFAULT_POLL_MS,
    initialData: DEMO_PULSE,
    demoData: DEMO_PULSE,
    liveInDemoMode: true,
    enabled,
    fetcher: () => {
      const p = new URLSearchParams({ view: 'pulse' })
      if (repo) p.set('repo', repo)
      return fetchView<PulsePayload>(p)
    },
  })
}

export function usePipelineMatrix(repo: string | null, days: number, enabled = true) {
  const demo = days === DEMO_MATRIX_DAYS ? DEMO_MATRIX : buildDemoMatrix(days)
  return useCache<MatrixPayload>({
    key: `gh-pipelines-matrix:${repo ?? 'all'}:${days}`,
    category: 'default',
    refreshInterval: DEFAULT_POLL_MS,
    initialData: demo,
    demoData: demo,
    liveInDemoMode: true,
    enabled,
    fetcher: () => {
      const p = new URLSearchParams({ view: 'matrix', days: String(days) })
      if (repo) p.set('repo', repo)
      return fetchView<MatrixPayload>(p)
    },
  })
}

export function usePipelineFlow(repo: string | null, enabled = true) {
  return useCache<FlowPayload>({
    key: `gh-pipelines-flow:${repo ?? 'all'}`,
    category: 'default',
    refreshInterval: FLOW_POLL_MS,
    initialData: DEMO_FLOW,
    demoData: DEMO_FLOW,
    liveInDemoMode: true,
    enabled,
    fetcher: () => {
      const p = new URLSearchParams({ view: 'flow' })
      if (repo) p.set('repo', repo)
      return fetchView<FlowPayload>(p)
    },
  })
}

export function usePipelineFailures(repo: string | null, enabled = true) {
  return useCache<FailuresPayload>({
    key: `gh-pipelines-failures:${repo ?? 'all'}`,
    category: 'default',
    refreshInterval: DEFAULT_POLL_MS,
    initialData: DEMO_FAILURES,
    demoData: DEMO_FAILURES,
    liveInDemoMode: true,
    enabled,
    fetcher: () => {
      const p = new URLSearchParams({ view: 'failures' })
      if (repo) p.set('repo', repo)
      return fetchView<FailuresPayload>(p)
    },
  })
}

// ---------------------------------------------------------------------------
// Mutations + log drill-down (no caching — one-shot)
// ---------------------------------------------------------------------------

export interface MutationResult {
  ok: boolean
  error?: string
  status: number
}

export function usePipelineMutations() {
  const run = useCallback(
    async (op: 'rerun' | 'cancel', repo: string, runId: number): Promise<MutationResult> => {
      const p = new URLSearchParams({ view: 'mutate', op, repo, run: String(runId) })
      try {
        const res = await fetch(`/api/github-pipelines?${p.toString()}`, {
          method: 'POST',
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        })
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        return {
          ok: res.ok,
          error: body.error,
          status: res.status,
        }
      } catch (err) {
        return { ok: false, error: (err as Error).message, status: 0 }
      }
    },
    []
  )
  return { run }
}

export async function fetchPipelineLog(
  repo: string,
  jobId: number
): Promise<{ log: string; lines: number; truncatedFrom: number } | { error: string }> {
  const p = new URLSearchParams({ view: 'log', repo, job: String(jobId) })
  try {
    const res = await fetch(`/api/github-pipelines?${p.toString()}`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    const body = (await res.json()) as {
      log?: string
      lines?: number
      truncatedFrom?: number
      error?: string
    }
    if (!res.ok) return { error: body.error ?? `HTTP ${res.status}` }
    return {
      log: body.log ?? '',
      lines: body.lines ?? 0,
      truncatedFrom: body.truncatedFrom ?? 0,
    }
  } catch (err) {
    return { error: (err as Error).message }
  }
}
