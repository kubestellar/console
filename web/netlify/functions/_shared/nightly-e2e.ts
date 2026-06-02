/**
 * Shared helpers for the Nightly E2E Netlify function.
 */
import type { getStore } from "@netlify/blobs";
import { unzipSync } from "fflate";
import { readCappedBuffer, readCappedJson } from "./read-capped-json";

export const CACHE_STORE = "nightly-e2e";
export const CACHE_KEY = "runs";
const IMAGE_CACHE_KEY = "guide-images";
const RUN_IMAGE_CACHE_KEY = "run-images"; // per-run artifact image metadata
export const CACHE_IDLE_TTL_MS = 5 * 60 * 1000; // 5 minutes
export const CACHE_ACTIVE_TTL_MS = 2 * 60 * 1000; // 2 minutes when jobs running
export const STALE_SERVE_WINDOW_MS = 60 * 60 * 1000; // serve stale data up to 1 hour past TTL
const IMAGE_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes for image tags
const ARTIFACT_FETCH_TIMEOUT_MS = 10_000; // timeout for individual artifact downloads
const GH_API_TIMEOUT_MS = 10_000; // timeout for GitHub API calls
const MAX_ARTIFACT_ZIP_BYTES = 5_242_880;
const RUNS_PER_PAGE = 7;
const GITHUB_API = "https://api.github.com";
const IMAGE_REPO = "llm-d/llm-d";
const SEARCH_RADIUS = 5; // lines to search around hub: for name/tag

export interface NightlyWorkflow {
  repo: string;
  workflowFile: string;
  guide: string;
  acronym: string;
  platform: string;
  model: string;
  gpuType: string;
  gpuCount: number;
  guidePath?: string;
  otherImages?: Record<string, string>;
}

interface ImageCacheEntry {
  images: Record<string, Record<string, string>>;
  expiresAt: number;
}

export interface RunImageMetadata {
  llmdImages: Record<string, string>;
  otherImages: Record<string, string>;
}

interface RunImageCache {
  runs: Record<string, RunImageMetadata | null>;
}

export interface NightlyRun {
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

export interface NightlyGuideStatus {
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

export interface CacheEntry {
  guides: NightlyGuideStatus[];
  cachedAt: string;
  expiresAt: number;
}

type BlobStore = ReturnType<typeof getStore>;

const NIGHTLY_WORKFLOWS: NightlyWorkflow[] = [
  { repo: "llm-d/llm-d", workflowFile: "nightly-e2e-optimized-baseline-ocp.yaml", guide: "Optimized Baseline", acronym: "IS", platform: "OCP", model: "Qwen3-32B", gpuType: "H100", gpuCount: 2, guidePath: "optimized-baseline" },
  { repo: "llm-d/llm-d", workflowFile: "nightly-e2e-pd-disaggregation-ocp.yaml", guide: "PD Disaggregation", acronym: "PD", platform: "OCP", model: "Qwen3-0.6B", gpuType: "H100", gpuCount: 2, guidePath: "pd-disaggregation" },
  { repo: "llm-d/llm-d", workflowFile: "nightly-e2e-precise-prefix-cache-ocp.yaml", guide: "Precise Prefix Cache", acronym: "PPC", platform: "OCP", model: "Qwen3-32B", gpuType: "H100", gpuCount: 2, guidePath: "precise-prefix-cache-aware" },
  { repo: "llm-d/llm-d", workflowFile: "nightly-e2e-tiered-prefix-cache-ocp.yaml", guide: "Tiered Prefix Cache", acronym: "TPC", platform: "OCP", model: "Qwen3-0.6B", gpuType: "H100", gpuCount: 1, guidePath: "tiered-prefix-cache" },
  { repo: "llm-d/llm-d", workflowFile: "nightly-e2e-wide-ep-lws-ocp.yaml", guide: "Wide EP + LWS", acronym: "WEP", platform: "OCP", model: "Qwen3-0.6B", gpuType: "H100", gpuCount: 2, guidePath: "wide-ep-lws" },
  { repo: "llm-d/llm-d", workflowFile: "nightly-e2e-wva-ocp.yaml", guide: "WVA", acronym: "WVA", platform: "OCP", model: "Llama-3.1-8B", gpuType: "A100", gpuCount: 2, guidePath: "workload-autoscaling" },
  { repo: "llm-d/llm-d", workflowFile: "nightly-e2e-optimized-baseline-gke.yaml", guide: "Optimized Baseline", acronym: "IS", platform: "GKE", model: "Qwen3-32B", gpuType: "L4", gpuCount: 2, guidePath: "optimized-baseline" },
  { repo: "llm-d/llm-d", workflowFile: "nightly-e2e-pd-disaggregation-gke.yaml", guide: "PD Disaggregation", acronym: "PD", platform: "GKE", model: "Qwen3-0.6B", gpuType: "L4", gpuCount: 2, guidePath: "pd-disaggregation" },
  { repo: "llm-d/llm-d", workflowFile: "nightly-e2e-wide-ep-lws-gke.yaml", guide: "Wide EP + LWS", acronym: "WEP", platform: "GKE", model: "Qwen3-0.6B", gpuType: "L4", gpuCount: 2, guidePath: "wide-ep-lws" },
  { repo: "llm-d/llm-d", workflowFile: "nightly-e2e-optimized-baseline-cks.yaml", guide: "Optimized Baseline", acronym: "IS", platform: "CKS", model: "Qwen3-32B", gpuType: "H100", gpuCount: 2, guidePath: "optimized-baseline" },
  { repo: "llm-d/llm-d", workflowFile: "nightly-e2e-pd-disaggregation-cks.yaml", guide: "PD Disaggregation", acronym: "PD", platform: "CKS", model: "Qwen3-0.6B", gpuType: "H100", gpuCount: 2, guidePath: "pd-disaggregation" },
  { repo: "llm-d/llm-d", workflowFile: "nightly-e2e-wide-ep-lws-cks.yaml", guide: "Wide EP + LWS", acronym: "WEP", platform: "CKS", model: "Qwen3-0.6B", gpuType: "H100", gpuCount: 2, guidePath: "wide-ep-lws" },
  { repo: "llm-d/llm-d", workflowFile: "nightly-e2e-wva-cks.yaml", guide: "WVA", acronym: "WVA", platform: "CKS", model: "Llama-3.1-8B", gpuType: "H100", gpuCount: 2, guidePath: "workload-autoscaling" },
];

function computePassRate(runs: NightlyRun[]): number {
  const completed = runs.filter((run) => run.status === "completed");
  if (completed.length === 0) return 0;
  return Math.round(
    (completed.filter((run) => run.conclusion === "success").length /
      completed.length) *
      100
  );
}

function successRate(runs: NightlyRun[]): number {
  if (runs.length === 0) return 0;
  return runs.filter((run) => run.conclusion === "success").length / runs.length;
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

export function hasInProgressRuns(guides: NightlyGuideStatus[]): boolean {
  return guides.some((guide) => guide.runs.some((run) => run.status === "in_progress"));
}

function isGPUStep(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.includes("gpu") && lower.includes("availab");
}

const IMAGE_RE = /ghcr\.io\/llm-d\/([\w][\w.-]*?):([\w][\w.+-]*)/g;
const HUB_RE = /^.*hub:\s*ghcr\.io\/llm-d\b.*$/i;
const NAME_RE = /^.*name:\s*([\w][\w.-]*).*$/i;
const TAG_RE = /^.*tag:\s*([\w][\w.+-]*).*$/i;

// Dangerous keys that can be used for prototype pollution (CWE-1321)
const PROTOTYPE_POLLUTION_KEYS = ["__proto__", "constructor", "prototype"];

function isSafeKey(key: string): boolean {
  return !PROTOTYPE_POLLUTION_KEYS.includes(key);
}

function parseImagesFromYAML(content: string): Record<string, string> {
  const images: Record<string, string> = Object.create(null);

  for (const match of content.matchAll(IMAGE_RE)) {
    const key = match[1];
    // Filter out prototype-polluting keys
    if (isSafeKey(key)) {
      images[key] = match[2];
    }
  }

  const lines = content.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    if (!HUB_RE.test(lines[index])) continue;

    let name = "";
    let tag = "";
    const start = Math.max(0, index - SEARCH_RADIUS);
    const end = Math.min(lines.length - 1, index + SEARCH_RADIUS);

    for (let searchIndex = start; searchIndex <= end; searchIndex += 1) {
      const trimmed = lines[searchIndex].trim();
      if (trimmed.startsWith("#")) continue;
      if (!name) {
        const nameMatch = NAME_RE.exec(lines[searchIndex]);
        if (nameMatch) name = nameMatch[1];
      }
      if (!tag) {
        const tagMatch = TAG_RE.exec(lines[searchIndex]);
        if (tagMatch) tag = tagMatch[1];
      }
    }

    if (name && tag && isSafeKey(name)) {
      images[name] = tag;
    }
  }

  return images;
}

interface TreeEntry {
  path: string;
  sha: string;
}

interface GitTreeNode {
  type?: string;
  path: string;
  sha: string;
}

interface GitTreeResponse {
  tree?: GitTreeNode[];
}

async function readCappedJsonResponse<T>(response: Response): Promise<T> {
  return readCappedJson<T>(response, "GitHub API");
}

async function fetchGuideYAMLFiles(token: string): Promise<TreeEntry[]> {
  const url = `${GITHUB_API}/repos/${IMAGE_REPO}/git/trees/main?recursive=1`;
  const headers: Record<string, string> = { Accept: "application/vnd.github.v3+json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(url, { headers, signal: AbortSignal.timeout(GH_API_TIMEOUT_MS) });
  if (!response.ok) return [];

  const data = await readCappedJsonResponse<GitTreeResponse>(response);
  const results: TreeEntry[] = [];

  for (const entry of data.tree ?? []) {
    if (entry.type !== "blob") continue;
    if (!entry.path.startsWith("guides/")) continue;
    if (!entry.path.endsWith(".yaml")) continue;

    const name = entry.path.substring(entry.path.lastIndexOf("/") + 1);
    if (
      name === "values.yaml" ||
      name === "decode.yaml" ||
      name === "prefill.yaml" ||
      name.includes("inferencepool")
    ) {
      results.push({ path: entry.path, sha: entry.sha });
    }
  }

  return results;
}

interface GitBlobResponse {
  encoding?: string;
  content?: string;
}

async function fetchBlob(sha: string, token: string): Promise<string> {
  const url = `${GITHUB_API}/repos/${IMAGE_REPO}/git/blobs/${sha}`;
  const headers: Record<string, string> = { Accept: "application/vnd.github.v3+json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(url, { headers, signal: AbortSignal.timeout(GH_API_TIMEOUT_MS) });
  if (!response.ok) return "";

  const blob = await readCappedJsonResponse<GitBlobResponse>(response);
  if (blob.encoding === "base64") {
    return atob(blob.content ?? "");
  }
  return blob.content ?? "";
}

async function fetchGuideImages(
  token: string,
  store: BlobStore,
): Promise<Record<string, Record<string, string>>> {
  try {
    const cached = await store.get(IMAGE_CACHE_KEY, { type: "text" });
    if (cached) {
      const entry = JSON.parse(cached) as ImageCacheEntry;
      if (Date.now() < entry.expiresAt) {
        return entry.images;
      }
    }
  } catch {
    // Cache miss — proceed to fetch
  }

  const guidePaths = [...new Set(NIGHTLY_WORKFLOWS.map((workflow) => workflow.guidePath).filter(Boolean) as string[])];
  const yamlFiles = await fetchGuideYAMLFiles(token);
  const imagesByGuide: Record<string, Record<string, string>> = Object.create(null);

  await Promise.all(
    guidePaths.map(async (guidePath) => {
      const prefix = `guides/${guidePath}/`;
      const files = yamlFiles.filter((file) => file.path.startsWith(prefix));
      const images: Record<string, string> = Object.create(null);
      const contents = await Promise.all(files.map(async (file) => fetchBlob(file.sha, token)));

      for (const content of contents) {
        if (!content) continue;
        const parsed = parseImagesFromYAML(content);
        // Safely merge without prototype pollution
        for (const [key, value] of Object.entries(parsed)) {
          if (isSafeKey(key)) {
            images[key] = value;
          }
        }
      }

      if (Object.keys(images).length > 0) {
        imagesByGuide[guidePath] = images;
      }
    }),
  );

  const cacheEntry: ImageCacheEntry = {
    images: imagesByGuide,
    expiresAt: Date.now() + IMAGE_CACHE_TTL_MS,
  };
  store.set(IMAGE_CACHE_KEY, JSON.stringify(cacheEntry)).catch((error) => {
    console.warn("[nightly-e2e] blob cache write failed:", error instanceof Error ? error.message : error);
  });

  return imagesByGuide;
}

interface ArtifactSummary {
  id: number;
  workflow_run?: {
    id?: number;
  };
}

interface ArtifactListResponse {
  artifacts?: ArtifactSummary[];
}

async function fetchRepoArtifacts(repo: string, token: string): Promise<Map<number, number>> {
  const url = `${GITHUB_API}/repos/${repo}/actions/artifacts?name=image-metadata&per_page=100`;
  const headers: Record<string, string> = { Accept: "application/vnd.github.v3+json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(url, { headers, signal: AbortSignal.timeout(ARTIFACT_FETCH_TIMEOUT_MS) });
  if (!response.ok) return new Map();

  const data = await readCappedJsonResponse<ArtifactListResponse>(response);
  const artifactsByRun = new Map<number, number>();
  for (const artifact of data.artifacts ?? []) {
    if (artifact.workflow_run?.id) {
      artifactsByRun.set(artifact.workflow_run.id, artifact.id);
    }
  }

  return artifactsByRun;
}

async function downloadArtifact(
  repo: string,
  artifactId: number,
  token: string,
): Promise<RunImageMetadata | null> {
  try {
    const url = `${GITHUB_API}/repos/${repo}/actions/artifacts/${artifactId}/zip`;
    const headers: Record<string, string> = { Accept: "application/vnd.github.v3+json" };
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetch(url, {
      headers,
      redirect: "follow",
      signal: AbortSignal.timeout(ARTIFACT_FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;

    const buffer = await readCappedBuffer(response, MAX_ARTIFACT_ZIP_BYTES, "GitHub artifact ZIP");
    const unzipped = unzipSync(new Uint8Array(buffer));
    const jsonFile = Object.values(unzipped)[0];
    if (!jsonFile) return null;

    const text = new TextDecoder().decode(jsonFile);
    const metadata = JSON.parse(text) as Partial<RunImageMetadata>;
    
    // Filter out prototype-polluting keys from parsed data
    const llmdImages = Object.create(null);
    const otherImages = Object.create(null);
    
    if (metadata.llmdImages && typeof metadata.llmdImages === 'object') {
      for (const [key, value] of Object.entries(metadata.llmdImages)) {
        if (isSafeKey(key)) {
          llmdImages[key] = value;
        }
      }
    }
    
    if (metadata.otherImages && typeof metadata.otherImages === 'object') {
      for (const [key, value] of Object.entries(metadata.otherImages)) {
        if (isSafeKey(key)) {
          otherImages[key] = value;
        }
      }
    }
    
    return {
      llmdImages,
      otherImages,
    };
  } catch {
    return null;
  }
}

async function enrichRunsWithImages(
  allGuides: { repo: string; runs: NightlyRun[] }[],
  token: string,
  store: BlobStore,
): Promise<void> {
  let cache: RunImageCache = { runs: {} };
  try {
    const cached = await store.get(RUN_IMAGE_CACHE_KEY, { type: "text" });
    if (cached) {
      cache = JSON.parse(cached) as RunImageCache;
    }
  } catch {
    // Cache miss
  }

  const uncachedRuns: { repo: string; run: NightlyRun }[] = [];
  for (const guide of allGuides) {
    for (const run of guide.runs) {
      if (run.status !== "completed") continue;
      if (String(run.id) in cache.runs) {
        const metadata = cache.runs[String(run.id)];
        if (metadata) {
          run.llmdImages = metadata.llmdImages;
          run.otherImages = metadata.otherImages;
        }
        continue;
      }
      uncachedRuns.push({ repo: guide.repo, run });
    }
  }

  if (uncachedRuns.length === 0) return;

  const repos = [...new Set(uncachedRuns.map((entry) => entry.repo))];
  const artifactMaps = new Map<string, Map<number, number>>();
  await Promise.all(
    repos.map(async (repo) => {
      artifactMaps.set(repo, await fetchRepoArtifacts(repo, token));
    }),
  );

  let cacheUpdated = false;
  await Promise.all(
    uncachedRuns.map(async ({ repo, run }) => {
      const artifactId = artifactMaps.get(repo)?.get(run.id);
      if (!artifactId) {
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
    }),
  );

  if (cacheUpdated) {
    store.set(RUN_IMAGE_CACHE_KEY, JSON.stringify(cache)).catch((error) => {
      console.warn("[nightly-e2e] run-image cache write failed:", error instanceof Error ? error.message : error);
    });
  }
}

interface GitHubWorkflowRun {
  id: number;
  status: string;
  conclusion: string | null;
  created_at: string;
  updated_at: string;
  html_url: string;
  run_number: number;
  event: string;
}

interface WorkflowRunsResponse {
  workflow_runs?: GitHubWorkflowRun[];
}

async function fetchWorkflowRuns(wf: NightlyWorkflow, token: string): Promise<NightlyRun[]> {
  const url = `${GITHUB_API}/repos/${wf.repo}/actions/workflows/${wf.workflowFile}/runs?per_page=${RUNS_PER_PAGE}`;
  const headers: Record<string, string> = { Accept: "application/vnd.github.v3+json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(url, { headers, signal: AbortSignal.timeout(GH_API_TIMEOUT_MS) });
  if (response.status === 404) return [];
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub API ${response.status}: ${body}`);
  }

  const data = await readCappedJsonResponse<WorkflowRunsResponse>(response);
  const runs = (data.workflow_runs ?? [])
    .filter((run) => run.status !== "queued")
    .map((run) => ({
      id: run.id,
      status: run.status,
      conclusion: run.conclusion,
      createdAt: run.created_at,
      updatedAt: run.updated_at,
      htmlUrl: run.html_url,
      runNumber: run.run_number,
      failureReason: "",
      model: wf.model,
      gpuType: wf.gpuType,
      gpuCount: wf.gpuCount,
      event: run.event,
    }));

  await classifyFailures(wf.repo, runs, token);
  return runs;
}

async function classifyFailures(repo: string, runs: NightlyRun[], token: string): Promise<void> {
  const failedRuns = runs.filter((run) => run.conclusion === "failure");
  await Promise.all(
    failedRuns.map(async (run) => {
      run.failureReason = await detectGPUFailure(repo, run.id, token);
    }),
  );
}

interface GitHubJobStep {
  conclusion?: string | null;
  name: string;
}

interface GitHubJob {
  steps?: GitHubJobStep[];
}

interface JobsResponse {
  jobs?: GitHubJob[];
}

async function detectGPUFailure(repo: string, runId: number, token: string): Promise<string> {
  try {
    const url = `${GITHUB_API}/repos/${repo}/actions/runs/${runId}/jobs?per_page=30`;
    const headers: Record<string, string> = { Accept: "application/vnd.github.v3+json" };
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetch(url, { headers, signal: AbortSignal.timeout(GH_API_TIMEOUT_MS) });
    if (!response.ok) return "test_failure";

    const data = await readCappedJsonResponse<JobsResponse>(response);
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

export async function fetchAll(token: string, store: BlobStore): Promise<NightlyGuideStatus[]> {
  const [results, guideImages] = await Promise.all([
    Promise.allSettled(NIGHTLY_WORKFLOWS.map(async (workflow) => fetchWorkflowRuns(workflow, token))),
    fetchGuideImages(token, store),
  ]);

  const guides = NIGHTLY_WORKFLOWS.map((workflow, index) => {
    const result = results[index];
    const runs = result.status === "fulfilled" ? result.value : [];
    const latestConclusion = runs.length > 0 ? runs[0].conclusion ?? runs[0].status : null;
    const llmdImages = workflow.guidePath ? guideImages[workflow.guidePath] ?? {} : {};

    return {
      guide: workflow.guide,
      acronym: workflow.acronym,
      platform: workflow.platform,
      repo: workflow.repo,
      workflowFile: workflow.workflowFile,
      runs,
      passRate: computePassRate(runs),
      trend: computeTrend(runs),
      latestConclusion,
      model: workflow.model,
      gpuType: workflow.gpuType,
      gpuCount: workflow.gpuCount,
      llmdImages,
      otherImages: workflow.otherImages,
    };
  });

  await enrichRunsWithImages(guides, token, store);
  return guides;
}
