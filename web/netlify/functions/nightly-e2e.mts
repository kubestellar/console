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
import { unzipSync } from "fflate";

const CACHE_STORE = "nightly-e2e";
const CACHE_KEY = "runs";
const IMAGE_CACHE_KEY = "guide-images";
const RUN_IMAGE_CACHE_KEY = "run-images"; // per-run artifact image metadata
const CACHE_IDLE_TTL_MS = 5 * 60 * 1000;   // 5 minutes
const CACHE_ACTIVE_TTL_MS = 2 * 60 * 1000; // 2 minutes when jobs running
const IMAGE_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes for image tags
const ARTIFACT_FETCH_TIMEOUT_MS = 10_000;   // timeout for individual artifact downloads
const RUNS_PER_PAGE = 7;
const GITHUB_API = "https://api.github.com";
const IMAGE_REPO = "llm-d/llm-d";
const SEARCH_RADIUS = 5; // lines to search around hub: for name/tag

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
  guidePath?: string;  // directory under guides/ in llm-d/llm-d repo
  otherImages?: Record<string, string>;
}

interface ImageCacheEntry {
  images: Record<string, Record<string, string>>; // guidePath → imageName → tag
  expiresAt: number;
}

interface RunImageMetadata {
  llmdImages: Record<string, string>;
  otherImages: Record<string, string>;
}

interface RunImageCache {
  runs: Record<string, RunImageMetadata | null>; // run ID → metadata (null = no artifact)
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
  llmdImages?: Record<string, string>;
  otherImages?: Record<string, string>;
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
  llmdImages: Record<string, string>;
  otherImages?: Record<string, string>;
}

interface CacheEntry {
  guides: NightlyGuideStatus[];
  cachedAt: string;
  expiresAt: number; // epoch ms
}

// ---------------------------------------------------------------------------
// Workflow definitions — image tags are fetched dynamically from guide YAML files
// ---------------------------------------------------------------------------

const NIGHTLY_WORKFLOWS: NightlyWorkflow[] = [
  // OCP
  { repo: "llm-d/llm-d", workflowFile: "nightly-e2e-inference-scheduling-ocp.yaml", guide: "Inference Scheduling", acronym: "IS", platform: "OCP", model: "Qwen3-32B", gpuType: "H100", gpuCount: 2, guidePath: "inference-scheduling" },
  { repo: "llm-d/llm-d", workflowFile: "nightly-e2e-pd-disaggregation-ocp.yaml", guide: "PD Disaggregation", acronym: "PD", platform: "OCP", model: "Qwen3-0.6B", gpuType: "H100", gpuCount: 2, guidePath: "pd-disaggregation" },
  { repo: "llm-d/llm-d", workflowFile: "nightly-e2e-precise-prefix-cache-ocp.yaml", guide: "Precise Prefix Cache", acronym: "PPC", platform: "OCP", model: "Qwen3-32B", gpuType: "H100", gpuCount: 2, guidePath: "precise-prefix-cache-aware" },
  { repo: "llm-d/llm-d", workflowFile: "nightly-e2e-simulated-accelerators.yaml", guide: "Simulated Accelerators", acronym: "SA", platform: "OCP", model: "Simulated", gpuType: "CPU", gpuCount: 0, guidePath: "simulated-accelerators" },
  { repo: "llm-d/llm-d", workflowFile: "nightly-e2e-tiered-prefix-cache-ocp.yaml", guide: "Tiered Prefix Cache", acronym: "TPC", platform: "OCP", model: "Qwen3-0.6B", gpuType: "H100", gpuCount: 1, guidePath: "tiered-prefix-cache" },
  { repo: "llm-d/llm-d", workflowFile: "nightly-e2e-wide-ep-lws-ocp.yaml", guide: "Wide EP + LWS", acronym: "WEP", platform: "OCP", model: "Qwen3-0.6B", gpuType: "H100", gpuCount: 2, guidePath: "wide-ep-lws" },
  { repo: "llm-d/llm-d", workflowFile: "nightly-e2e-wva-ocp.yaml", guide: "WVA", acronym: "WVA", platform: "OCP", model: "Llama-3.1-8B", gpuType: "A100", gpuCount: 2, guidePath: "workload-autoscaling" },
  { repo: "llm-d/llm-d-benchmark", workflowFile: "ci-nighly-benchmark-ocp.yaml", guide: "Benchmarking", acronym: "BM", platform: "OCP", model: "opt-125m", gpuType: "A100", gpuCount: 1 },
  // GKE
  { repo: "llm-d/llm-d", workflowFile: "nightly-e2e-inference-scheduling-gke.yaml", guide: "Inference Scheduling", acronym: "IS", platform: "GKE", model: "Qwen3-32B", gpuType: "L4", gpuCount: 2, guidePath: "inference-scheduling" },
  { repo: "llm-d/llm-d", workflowFile: "nightly-e2e-pd-disaggregation-gke.yaml", guide: "PD Disaggregation", acronym: "PD", platform: "GKE", model: "Qwen3-0.6B", gpuType: "L4", gpuCount: 2, guidePath: "pd-disaggregation" },
  { repo: "llm-d/llm-d", workflowFile: "nightly-e2e-wide-ep-lws-gke.yaml", guide: "Wide EP + LWS", acronym: "WEP", platform: "GKE", model: "Qwen3-0.6B", gpuType: "L4", gpuCount: 2, guidePath: "wide-ep-lws" },
  { repo: "llm-d/llm-d-benchmark", workflowFile: "ci-nighly-benchmark-gke.yaml", guide: "Benchmarking", acronym: "BM", platform: "GKE", model: "opt-125m", gpuType: "L4", gpuCount: 1 },
  // CKS
  { repo: "llm-d/llm-d", workflowFile: "nightly-e2e-inference-scheduling-cks.yaml", guide: "Inference Scheduling", acronym: "IS", platform: "CKS", model: "Qwen3-32B", gpuType: "H100", gpuCount: 2, guidePath: "inference-scheduling" },
  { repo: "llm-d/llm-d", workflowFile: "nightly-e2e-pd-disaggregation-cks.yaml", guide: "PD Disaggregation", acronym: "PD", platform: "CKS", model: "Qwen3-0.6B", gpuType: "H100", gpuCount: 2, guidePath: "pd-disaggregation" },
  { repo: "llm-d/llm-d", workflowFile: "nightly-e2e-wide-ep-lws-cks.yaml", guide: "Wide EP + LWS", acronym: "WEP", platform: "CKS", model: "Qwen3-0.6B", gpuType: "H100", gpuCount: 2, guidePath: "wide-ep-lws" },
  { repo: "llm-d/llm-d", workflowFile: "nightly-e2e-wva-cks.yaml", guide: "WVA", acronym: "WVA", platform: "CKS", model: "Llama-3.1-8B", gpuType: "H100", gpuCount: 2, guidePath: "workload-autoscaling" },
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
// Dynamic image tag fetching from guide YAML files
// ---------------------------------------------------------------------------

/** Regex for direct image refs: ghcr.io/llm-d/<name>:<tag> */
const IMAGE_RE = /ghcr\.io\/llm-d\/([\w][\w.-]*?):([\w][\w.+-]*)/g;
/** Regex for hub: ghcr.io/llm-d pattern (EPP images) */
const HUB_RE = /hub:\s*ghcr\.io\/llm-d\b/i;
const NAME_RE = /name:\s*([\w][\w.-]*)/i;
const TAG_RE = /tag:\s*([\w][\w.+-]*)/i;

/** Parse ghcr.io/llm-d image references from YAML content */
function parseImagesFromYAML(content: string): Record<string, string> {
  const images: Record<string, string> = {};

  // Pattern 1: direct image references
  for (const match of content.matchAll(IMAGE_RE)) {
    images[match[1]] = match[2];
  }

  // Pattern 2: hub/name/tag (EPP images)
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (!HUB_RE.test(lines[i])) continue;

    let name = "";
    let tag = "";
    const start = Math.max(0, i - SEARCH_RADIUS);
    const end = Math.min(lines.length - 1, i + SEARCH_RADIUS);

    for (let j = start; j <= end; j++) {
      const trimmed = lines[j].trim();
      if (trimmed.startsWith("#")) continue;
      if (!name) {
        const nm = NAME_RE.exec(lines[j]);
        if (nm) name = nm[1];
      }
      if (!tag) {
        const tg = TAG_RE.exec(lines[j]);
        if (tg) tag = tg[1];
      }
    }
    if (name && tag) images[name] = tag;
  }

  return images;
}

interface TreeEntry {
  path: string;
  sha: string;
}

/** Fetch the repo tree and return YAML files under guides/ likely to contain image refs */
async function fetchGuideYAMLFiles(token: string): Promise<TreeEntry[]> {
  const url = `${GITHUB_API}/repos/${IMAGE_REPO}/git/trees/main?recursive=1`;
  const headers: Record<string, string> = { Accept: "application/vnd.github.v3+json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(url, { headers });
  if (!res.ok) return [];

  const data = await res.json();
  const results: TreeEntry[] = [];

  for (const entry of data.tree ?? []) {
    if (entry.type !== "blob") continue;
    if (!entry.path.startsWith("guides/")) continue;
    if (!entry.path.endsWith(".yaml")) continue;

    const name = entry.path.substring(entry.path.lastIndexOf("/") + 1);
    if (name === "values.yaml" || name === "decode.yaml" || name === "prefill.yaml" ||
        name.includes("inferencepool")) {
      results.push({ path: entry.path, sha: entry.sha });
    }
  }

  return results;
}

/** Fetch a git blob's content by SHA */
async function fetchBlob(sha: string, token: string): Promise<string> {
  const url = `${GITHUB_API}/repos/${IMAGE_REPO}/git/blobs/${sha}`;
  const headers: Record<string, string> = { Accept: "application/vnd.github.v3+json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(url, { headers });
  if (!res.ok) return "";

  const blob = await res.json();
  if (blob.encoding === "base64") {
    return atob(blob.content);
  }
  return blob.content ?? "";
}

/** Fetch image tags for all guide paths, with Netlify Blob caching */
async function fetchGuideImages(
  token: string,
  store: ReturnType<typeof getStore>,
): Promise<Record<string, Record<string, string>>> {
  // Check image cache
  try {
    const cached = await store.get(IMAGE_CACHE_KEY, { type: "text" });
    if (cached) {
      const entry: ImageCacheEntry = JSON.parse(cached);
      if (Date.now() < entry.expiresAt) {
        return entry.images;
      }
    }
  } catch {
    // Cache miss — proceed to fetch
  }

  // Collect unique guide paths
  const guidePaths = [...new Set(
    NIGHTLY_WORKFLOWS.map((wf) => wf.guidePath).filter(Boolean) as string[]
  )];

  // Fetch the repo tree (single API call)
  const yamlFiles = await fetchGuideYAMLFiles(token);

  // For each guide, find relevant files and fetch their contents
  const result: Record<string, Record<string, string>> = {};

  await Promise.all(
    guidePaths.map(async (guidePath) => {
      const prefix = `guides/${guidePath}/`;
      const files = yamlFiles.filter((f) => f.path.startsWith(prefix));
      const images: Record<string, string> = {};

      // Fetch blobs in parallel for this guide
      const contents = await Promise.all(
        files.map((f) => fetchBlob(f.sha, token))
      );

      for (const content of contents) {
        if (!content) continue;
        Object.assign(images, parseImagesFromYAML(content));
      }

      if (Object.keys(images).length > 0) {
        result[guidePath] = images;
      }
    })
  );

  // Cache result (best-effort)
  const cacheEntry: ImageCacheEntry = {
    images: result,
    expiresAt: Date.now() + IMAGE_CACHE_TTL_MS,
  };
  store.set(IMAGE_CACHE_KEY, JSON.stringify(cacheEntry)).catch(() => {});

  return result;
}

// ---------------------------------------------------------------------------
// Per-run image metadata from workflow artifacts
// ---------------------------------------------------------------------------

/** Fetch all image-metadata artifacts for a repo (single API call per repo) */
async function fetchRepoArtifacts(
  repo: string,
  token: string,
): Promise<Map<number, number>> {
  const url = `${GITHUB_API}/repos/${repo}/actions/artifacts?name=image-metadata&per_page=100`;
  const headers: Record<string, string> = { Accept: "application/vnd.github.v3+json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(url, { headers, signal: AbortSignal.timeout(ARTIFACT_FETCH_TIMEOUT_MS) });
  if (!res.ok) return new Map();

  const data = await res.json();
  const result = new Map<number, number>(); // runId → artifactId
  for (const artifact of data.artifacts ?? []) {
    if (artifact.workflow_run?.id) {
      result.set(artifact.workflow_run.id, artifact.id);
    }
  }
  return result;
}

/** Download and unzip a single artifact, returning parsed image metadata */
async function downloadArtifact(
  repo: string,
  artifactId: number,
  token: string,
): Promise<RunImageMetadata | null> {
  try {
    const url = `${GITHUB_API}/repos/${repo}/actions/artifacts/${artifactId}/zip`;
    const headers: Record<string, string> = { Accept: "application/vnd.github.v3+json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(url, { headers, redirect: "follow", signal: AbortSignal.timeout(ARTIFACT_FETCH_TIMEOUT_MS) });
    if (!res.ok) return null;

    const buffer = await res.arrayBuffer();
    const unzipped = unzipSync(new Uint8Array(buffer));
    const jsonFile = Object.values(unzipped)[0];
    if (!jsonFile) return null;

    const text = new TextDecoder().decode(jsonFile);
    const metadata = JSON.parse(text);
    return {
      llmdImages: metadata.llmdImages || {},
      otherImages: metadata.otherImages || {},
    };
  } catch {
    return null;
  }
}

/**
 * Enrich completed runs with per-run image metadata from workflow artifacts.
 * Uses a persistent cache so only new runs trigger artifact downloads.
 */
async function enrichRunsWithImages(
  allGuides: { repo: string; runs: NightlyRun[] }[],
  token: string,
  store: ReturnType<typeof getStore>,
): Promise<void> {
  // Load cached run images
  let cache: RunImageCache = { runs: {} };
  try {
    const cached = await store.get(RUN_IMAGE_CACHE_KEY, { type: "text" });
    if (cached) cache = JSON.parse(cached);
  } catch { /* cache miss */ }

  // Find completed runs that aren't cached yet
  const uncachedRuns: { repo: string; run: NightlyRun }[] = [];
  for (const guide of allGuides) {
    for (const run of guide.runs) {
      if (run.status !== "completed") continue;
      if (String(run.id) in cache.runs) {
        // Apply cached metadata
        const meta = cache.runs[String(run.id)];
        if (meta) {
          run.llmdImages = meta.llmdImages;
          run.otherImages = meta.otherImages;
        }
        continue;
      }
      uncachedRuns.push({ repo: guide.repo, run });
    }
  }

  if (uncachedRuns.length === 0) return;

  // Fetch artifact listings per repo (deduplicated)
  const repos = [...new Set(uncachedRuns.map(r => r.repo))];
  const artifactMaps = new Map<string, Map<number, number>>();
  await Promise.all(
    repos.map(async (repo) => {
      artifactMaps.set(repo, await fetchRepoArtifacts(repo, token));
    })
  );

  // Download artifacts for uncached runs (parallel, with concurrency limit)
  let cacheUpdated = false;
  await Promise.all(
    uncachedRuns.map(async ({ repo, run }) => {
      const artifacts = artifactMaps.get(repo);
      const artifactId = artifacts?.get(run.id);

      if (!artifactId) {
        // No artifact for this run — cache null so we don't retry
        cache.runs[String(run.id)] = null;
        cacheUpdated = true;
        return;
      }

      const metadata = await downloadArtifact(repo, artifactId, token);
      cache.runs[String(run.id)] = metadata;
      cacheUpdated = true;

      if (metadata) {
        run.llmdImages = metadata.llmdImages;
        run.otherImages = metadata.otherImages;
      }
    })
  );

  // Persist updated cache (best-effort)
  if (cacheUpdated) {
    store.set(RUN_IMAGE_CACHE_KEY, JSON.stringify(cache)).catch(() => {});
  }
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
  token: string,
  store: ReturnType<typeof getStore>,
): Promise<NightlyGuideStatus[]> {
  // Fetch workflow runs and guide images concurrently
  const [results, guideImages] = await Promise.all([
    Promise.allSettled(
      NIGHTLY_WORKFLOWS.map((wf) => fetchWorkflowRuns(wf, token))
    ),
    fetchGuideImages(token, store),
  ]);

  const guides = NIGHTLY_WORKFLOWS.map((wf, i) => {
    const result = results[i];
    const runs =
      result.status === "fulfilled" ? result.value : [];

    let latestConclusion: string | null = null;
    if (runs.length > 0) {
      latestConclusion = runs[0].conclusion ?? runs[0].status;
    }

    // Guide-level images as fallback for runs without per-run artifacts
    const llmdImages = wf.guidePath ? (guideImages[wf.guidePath] ?? {}) : {};

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
      llmdImages,
      otherImages: wf.otherImages,
    };
  });

  // Enrich individual runs with per-run image metadata from workflow artifacts
  await enrichRunsWithImages(guides, token, store);

  return guides;
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
    const guides = await fetchAll(token, store);
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
