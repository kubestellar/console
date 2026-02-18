/**
 * Netlify Function: Nightly E2E Status
 *
 * Fetches GitHub Actions workflow run data for llm-d nightly E2E tests.
 * Ported from pkg/api/handlers/nightly_e2e.go for serverless deployment.
 *
 * GITHUB_TOKEN must be set as a Netlify environment variable (runtime only,
 * never in source code or build config). It is used server-side to call the
 * GitHub API and is never exposed to the client.
 */
import { getStore } from "@netlify/blobs";

const CACHE_STORE = "nightly-e2e";
const CACHE_KEY = "runs";
const CACHE_IDLE_TTL_MS = 5 * 60 * 1000;   // 5 minutes
const CACHE_ACTIVE_TTL_MS = 2 * 60 * 1000; // 2 minutes when jobs running
const RUNS_PER_PAGE = 7;
const GITHUB_API = "https://api.github.com";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NightlyWorkflow {
  repo: string;
  workflowFile: string;
  guide: string;
  acronym: string;
  platform: string;
  model: string;
  gpuType: string;
  gpuCount: number;
}

interface NightlyRun {
  id: number;
  status: string;
  conclusion: string | null;
  createdAt: string;
  updatedAt: string;
  htmlUrl: string;
  runNumber: number;
  failureReason: string;
  model: string;
  gpuType: string;
  gpuCount: number;
  event: string;
}

interface NightlyGuideStatus {
  guide: string;
  acronym: string;
  platform: string;
  repo: string;
  workflowFile: string;
  runs: NightlyRun[];
  passRate: number;
  trend: string;
  latestConclusion: string | null;
  model: string;
  gpuType: string;
  gpuCount: number;
}

interface CacheEntry {
  guides: NightlyGuideStatus[];
  cachedAt: string;
  expiresAt: number; // epoch ms
}

// ---------------------------------------------------------------------------
// Workflow definitions — must match Go handler and frontend demo data
// ---------------------------------------------------------------------------

const NIGHTLY_WORKFLOWS: NightlyWorkflow[] = [
  // OCP
  { repo: "llm-d/llm-d", workflowFile: "nightly-e2e-inference-scheduling-ocp.yaml", guide: "Inference Scheduling", acronym: "IS", platform: "OCP", model: "Qwen3-32B", gpuType: "H100", gpuCount: 2 },
  { repo: "llm-d/llm-d", workflowFile: "nightly-e2e-pd-disaggregation-ocp.yaml", guide: "PD Disaggregation", acronym: "PD", platform: "OCP", model: "Qwen3-0.6B", gpuType: "H100", gpuCount: 2 },
  { repo: "llm-d/llm-d", workflowFile: "nightly-e2e-precise-prefix-cache-ocp.yaml", guide: "Precise Prefix Cache", acronym: "PPC", platform: "OCP", model: "Qwen3-32B", gpuType: "H100", gpuCount: 2 },
  { repo: "llm-d/llm-d", workflowFile: "nightly-e2e-simulated-accelerators.yaml", guide: "Simulated Accelerators", acronym: "SA", platform: "OCP", model: "Simulated", gpuType: "CPU", gpuCount: 0 },
  { repo: "llm-d/llm-d", workflowFile: "nightly-e2e-tiered-prefix-cache-ocp.yaml", guide: "Tiered Prefix Cache", acronym: "TPC", platform: "OCP", model: "Qwen3-0.6B", gpuType: "H100", gpuCount: 1 },
  { repo: "llm-d/llm-d", workflowFile: "nightly-e2e-wide-ep-lws-ocp.yaml", guide: "Wide EP + LWS", acronym: "WEP", platform: "OCP", model: "Qwen3-0.6B", gpuType: "H100", gpuCount: 2 },
  { repo: "llm-d/llm-d", workflowFile: "nightly-e2e-wva-ocp.yaml", guide: "WVA", acronym: "WVA", platform: "OCP", model: "Llama-3.1-8B", gpuType: "A100", gpuCount: 2 },
  { repo: "llm-d/llm-d-benchmark", workflowFile: "ci-nighly-benchmark-ocp.yaml", guide: "Benchmarking", acronym: "BM", platform: "OCP", model: "opt-125m", gpuType: "A100", gpuCount: 1 },
  // GKE
  { repo: "llm-d/llm-d", workflowFile: "nightly-e2e-inference-scheduling-gke.yaml", guide: "Inference Scheduling", acronym: "IS", platform: "GKE", model: "Qwen3-32B", gpuType: "L4", gpuCount: 2 },
  { repo: "llm-d/llm-d", workflowFile: "nightly-e2e-pd-disaggregation-gke.yaml", guide: "PD Disaggregation", acronym: "PD", platform: "GKE", model: "Qwen3-0.6B", gpuType: "L4", gpuCount: 2 },
  { repo: "llm-d/llm-d", workflowFile: "nightly-e2e-wide-ep-lws-gke.yaml", guide: "Wide EP + LWS", acronym: "WEP", platform: "GKE", model: "Qwen3-0.6B", gpuType: "L4", gpuCount: 2 },
  { repo: "llm-d/llm-d-benchmark", workflowFile: "ci-nighly-benchmark-gke.yaml", guide: "Benchmarking", acronym: "BM", platform: "GKE", model: "opt-125m", gpuType: "L4", gpuCount: 1 },
  // CKS
  { repo: "llm-d/llm-d", workflowFile: "nightly-e2e-inference-scheduling-cks.yaml", guide: "Inference Scheduling", acronym: "IS", platform: "CKS", model: "Qwen3-32B", gpuType: "H100", gpuCount: 2 },
  { repo: "llm-d/llm-d", workflowFile: "nightly-e2e-pd-disaggregation-cks.yaml", guide: "PD Disaggregation", acronym: "PD", platform: "CKS", model: "Qwen3-0.6B", gpuType: "H100", gpuCount: 2 },
  { repo: "llm-d/llm-d", workflowFile: "nightly-e2e-wide-ep-lws-cks.yaml", guide: "Wide EP + LWS", acronym: "WEP", platform: "CKS", model: "Qwen3-0.6B", gpuType: "H100", gpuCount: 2 },
  { repo: "llm-d/llm-d", workflowFile: "nightly-e2e-wva-cks.yaml", guide: "WVA", acronym: "WVA", platform: "CKS", model: "Llama-3.1-8B", gpuType: "H100", gpuCount: 2 },
  { repo: "llm-d/llm-d-benchmark", workflowFile: "ci-nightly-benchmark-cks.yaml", guide: "Benchmarking", acronym: "BM", platform: "CKS", model: "opt-125m", gpuType: "H100", gpuCount: 1 },
];

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

function computePassRate(runs: NightlyRun[]): number {
  const completed = runs.filter((r) => r.status === "completed");
  if (completed.length === 0) return 0;
  return Math.round(
    (completed.filter((r) => r.conclusion === "success").length /
      completed.length) *
      100
  );
}

function successRate(runs: NightlyRun[]): number {
  if (runs.length === 0) return 0;
  return (
    runs.filter((r) => r.conclusion === "success").length / runs.length
  );
}

function computeTrend(runs: NightlyRun[]): string {
  if (runs.length < 4) return "steady";
  const recent = runs.slice(0, 3);
  const older = runs.slice(3);
  const recentPass = successRate(recent);
  const olderPass = successRate(older);
  if (recentPass > olderPass + 0.1) return "up";
  if (recentPass < olderPass - 0.1) return "down";
  return "steady";
}

function hasInProgressRuns(guides: NightlyGuideStatus[]): boolean {
  return guides.some((g) =>
    g.runs.some((r) => r.status === "in_progress")
  );
}

function isGPUStep(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.includes("gpu") && lower.includes("availab");
}

// ---------------------------------------------------------------------------
// GitHub API fetchers
// ---------------------------------------------------------------------------

async function fetchWorkflowRuns(
  wf: NightlyWorkflow,
  token: string
): Promise<NightlyRun[]> {
  const url = `${GITHUB_API}/repos/${wf.repo}/actions/workflows/${wf.workflowFile}/runs?per_page=${RUNS_PER_PAGE}`;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(url, { headers });

  if (res.status === 404) return []; // Workflow doesn't exist yet
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub API ${res.status}: ${body}`);
  }

  const data = await res.json();
  const runs: NightlyRun[] = (data.workflow_runs ?? [])
    .filter((r: { status: string }) => r.status !== "queued")
    .map(
      (r: {
        id: number;
        status: string;
        conclusion: string | null;
        created_at: string;
        updated_at: string;
        html_url: string;
        run_number: number;
        event: string;
      }) => ({
        id: r.id,
        status: r.status,
        conclusion: r.conclusion,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        htmlUrl: r.html_url,
        runNumber: r.run_number,
        failureReason: "",
        model: wf.model,
        gpuType: wf.gpuType,
        gpuCount: wf.gpuCount,
        event: r.event,
      })
    );

  // Classify GPU failures
  await classifyFailures(wf.repo, runs, token);
  return runs;
}

async function classifyFailures(
  repo: string,
  runs: NightlyRun[],
  token: string
): Promise<void> {
  const failedRuns = runs.filter(
    (r) => r.conclusion === "failure"
  );
  await Promise.all(
    failedRuns.map(async (run) => {
      run.failureReason = await detectGPUFailure(repo, run.id, token);
    })
  );
}

async function detectGPUFailure(
  repo: string,
  runID: number,
  token: string
): Promise<string> {
  try {
    const url = `${GITHUB_API}/repos/${repo}/actions/runs/${runID}/jobs?per_page=30`;
    const headers: Record<string, string> = {
      Accept: "application/vnd.github.v3+json",
    };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(url, { headers });
    if (!res.ok) return "test_failure";

    const data = await res.json();
    for (const job of data.jobs ?? []) {
      for (const step of job.steps ?? []) {
        if (step.conclusion === "failure" && isGPUStep(step.name)) {
          return "gpu_unavailable";
        }
      }
    }
  } catch {
    // Fall through to test_failure
  }
  return "test_failure";
}

async function fetchAll(
  token: string
): Promise<NightlyGuideStatus[]> {
  const results = await Promise.allSettled(
    NIGHTLY_WORKFLOWS.map((wf) => fetchWorkflowRuns(wf, token))
  );

  return NIGHTLY_WORKFLOWS.map((wf, i) => {
    const result = results[i];
    const runs =
      result.status === "fulfilled" ? result.value : [];

    let latestConclusion: string | null = null;
    if (runs.length > 0) {
      latestConclusion = runs[0].conclusion ?? runs[0].status;
    }

    return {
      guide: wf.guide,
      acronym: wf.acronym,
      platform: wf.platform,
      repo: wf.repo,
      workflowFile: wf.workflowFile,
      runs,
      passRate: computePassRate(runs),
      trend: computeTrend(runs),
      latestConclusion,
      model: wf.model,
      gpuType: wf.gpuType,
      gpuCount: wf.gpuCount,
    };
  });
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export default async (req: Request) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept",
    "Cache-Control": "no-cache, no-store",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const token = process.env.GITHUB_TOKEN || "";
  if (!token) {
    return new Response(
      JSON.stringify({ error: "GITHUB_TOKEN not configured", hint: "Set GITHUB_TOKEN in Netlify dashboard with Functions scope" }),
      { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Check blob cache
  const store = getStore(CACHE_STORE);
  try {
    const cached = await store.get(CACHE_KEY, { type: "text" });
    if (cached) {
      const entry: CacheEntry = JSON.parse(cached);
      if (Date.now() < entry.expiresAt) {
        return new Response(
          JSON.stringify({
            guides: entry.guides,
            cachedAt: entry.cachedAt,
            fromCache: true,
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }
  } catch {
    // Cache miss or parse error — proceed to fetch
  }

  // Fetch fresh data from GitHub
  try {
    const guides = await fetchAll(token);
    const now = new Date().toISOString();
    const ttl = hasInProgressRuns(guides)
      ? CACHE_ACTIVE_TTL_MS
      : CACHE_IDLE_TTL_MS;

    // Store in blob cache (best-effort)
    const cacheEntry: CacheEntry = {
      guides,
      cachedAt: now,
      expiresAt: Date.now() + ttl,
    };
    store.set(CACHE_KEY, JSON.stringify(cacheEntry)).catch(() => {});

    return new Response(
      JSON.stringify({ guides, cachedAt: now, fromCache: false }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: `Failed to fetch nightly E2E data: ${err instanceof Error ? err.message : String(err)}`,
      }),
      {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
};
