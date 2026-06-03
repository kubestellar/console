/**
 * Netlify Function: Missions Browse Proxy
 *
 * GET /api/missions/browse?path=fixes
 * Lists directory contents from kubestellar/console-kb via GitHub Contents API.
 * Caches responses in Netlify Blobs to avoid hitting GitHub on every request.
 * No GITHUB_TOKEN required — the repo is public.
 */
import { getStore } from "@netlify/blobs";
import {
  buildCorsHeaders,
  getClientIp,
  handlePreflight,
  rateLimitResponse,
} from "./_shared";
import { enforceSimpleRateLimit } from "./_shared/rate-limit";

const GITHUB_API_URL = "https://api.github.com";
const KB_REPO = "kubestellar/console-kb";
const DEFAULT_REF = "master";

/** Request timeout in milliseconds */
const FETCH_TIMEOUT_MS = 30_000;

/** Cache TTL: serve cached content for 1 hour before re-fetching from GitHub */
const CACHE_TTL_MS = 60 * 60 * 1000;
/** Negative cache TTL: briefly cache 404s to avoid repeated miss amplification. */
const NEGATIVE_CACHE_TTL_MS = 60_000;

/** CDN edge cache: tell Netlify CDN to cache successful responses for 10 minutes */
const CDN_CACHE_MAX_AGE_S = 600;
/** Cache 404 responses for 60 seconds. */
const NEGATIVE_CACHE_MAX_AGE_S = 60;

/** Maximum upstream response size (512 KB — directory listings are typically < 50 KB) */
const MAX_RESPONSE_BYTES = 512_000;
/** Maximum accepted path length for browse requests. */
const MAX_PATH_LENGTH = 256;

/** Allow cache-miss fetches at a bounded per-IP rate. */
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 60;
const RATE_LIMIT_RETRY_CACHE_CONTROL = "private, no-store";
const RATE_LIMIT_STORE_NAME = "missions-browse-rate-limit";
const RATE_LIMIT_PREFIX = "missions-browse:";

/** Number of retry attempts for transient upstream errors (#10966) */
const MAX_RETRIES = 2;
/** Base delay between retries in milliseconds */
const RETRY_BASE_DELAY_MS = 500;

const ROOT_MISSION_DIRECTORY = "fixes";
const CNCF_GENERATED_DIRECTORY = `${ROOT_MISSION_DIRECTORY}/cncf-generated`;
/** First-level community mission categories present in the embedded mission index. */
const ALLOWED_MISSION_CATEGORY_PATHS = new Set<string>([
  CNCF_GENERATED_DIRECTORY,
  `${ROOT_MISSION_DIRECTORY}/cncf-install`,
  `${ROOT_MISSION_DIRECTORY}/llm-d`,
  `${ROOT_MISSION_DIRECTORY}/multi-cluster`,
  `${ROOT_MISSION_DIRECTORY}/networking`,
  `${ROOT_MISSION_DIRECTORY}/orbit`,
  `${ROOT_MISSION_DIRECTORY}/platform-install`,
  `${ROOT_MISSION_DIRECTORY}/security`,
  `${ROOT_MISSION_DIRECTORY}/troubleshoot`,
  `${ROOT_MISSION_DIRECTORY}/workloads`,
]);
/** Known second-level browseable directories derived from embedded_kb/fixes/index.json. */
const ALLOWED_CNCF_GENERATED_PROJECT_PATHS = new Set<string>([
  `${CNCF_GENERATED_DIRECTORY}/akri`,
  `${CNCF_GENERATED_DIRECTORY}/alertmanager`,
  `${CNCF_GENERATED_DIRECTORY}/antrea`,
  `${CNCF_GENERATED_DIRECTORY}/apisix`,
  `${CNCF_GENERATED_DIRECTORY}/argo`,
  `${CNCF_GENERATED_DIRECTORY}/argo-events`,
  `${CNCF_GENERATED_DIRECTORY}/argo-rollouts`,
  `${CNCF_GENERATED_DIRECTORY}/argo-workflows`,
  `${CNCF_GENERATED_DIRECTORY}/armada`,
  `${CNCF_GENERATED_DIRECTORY}/atlantis`,
  `${CNCF_GENERATED_DIRECTORY}/backstage`,
  `${CNCF_GENERATED_DIRECTORY}/bank-vaults`,
  `${CNCF_GENERATED_DIRECTORY}/buildpacks`,
  `${CNCF_GENERATED_DIRECTORY}/caddy`,
  `${CNCF_GENERATED_DIRECTORY}/cadence-workflow`,
  `${CNCF_GENERATED_DIRECTORY}/capsule`,
  `${CNCF_GENERATED_DIRECTORY}/cartography`,
  `${CNCF_GENERATED_DIRECTORY}/cdk-for-kubernetes-cdk8s-`,
  `${CNCF_GENERATED_DIRECTORY}/cert-manager`,
  `${CNCF_GENERATED_DIRECTORY}/cilium`,
  `${CNCF_GENERATED_DIRECTORY}/clickhouse`,
  `${CNCF_GENERATED_DIRECTORY}/cloud-custodian`,
  `${CNCF_GENERATED_DIRECTORY}/cloud-native-network`,
  `${CNCF_GENERATED_DIRECTORY}/cloudevents`,
  `${CNCF_GENERATED_DIRECTORY}/clusternet`,
  `${CNCF_GENERATED_DIRECTORY}/clusterpedia`,
  `${CNCF_GENERATED_DIRECTORY}/confidential-containers`,
  `${CNCF_GENERATED_DIRECTORY}/connect-rpc`,
  `${CNCF_GENERATED_DIRECTORY}/consul`,
  `${CNCF_GENERATED_DIRECTORY}/container-network-interface-cni-`,
  `${CNCF_GENERATED_DIRECTORY}/containerd`,
  `${CNCF_GENERATED_DIRECTORY}/contour`,
  `${CNCF_GENERATED_DIRECTORY}/coredns`,
  `${CNCF_GENERATED_DIRECTORY}/cortex`,
  `${CNCF_GENERATED_DIRECTORY}/cozystack`,
  `${CNCF_GENERATED_DIRECTORY}/cri-o`,
  `${CNCF_GENERATED_DIRECTORY}/crossplane`,
  `${CNCF_GENERATED_DIRECTORY}/dapr`,
  `${CNCF_GENERATED_DIRECTORY}/dex`,
  `${CNCF_GENERATED_DIRECTORY}/dify`,
  `${CNCF_GENERATED_DIRECTORY}/distribution`,
  `${CNCF_GENERATED_DIRECTORY}/dragonfly`,
  `${CNCF_GENERATED_DIRECTORY}/emissary-ingress`,
  `${CNCF_GENERATED_DIRECTORY}/envoy`,
  `${CNCF_GENERATED_DIRECTORY}/etcd`,
  `${CNCF_GENERATED_DIRECTORY}/external-secrets`,
  `${CNCF_GENERATED_DIRECTORY}/falco`,
  `${CNCF_GENERATED_DIRECTORY}/falcosidekick`,
  `${CNCF_GENERATED_DIRECTORY}/flagger`,
  `${CNCF_GENERATED_DIRECTORY}/flatcar-container-linux`,
  `${CNCF_GENERATED_DIRECTORY}/flowise`,
  `${CNCF_GENERATED_DIRECTORY}/fluent-bit`,
  `${CNCF_GENERATED_DIRECTORY}/fluentd`,
  `${CNCF_GENERATED_DIRECTORY}/fluid`,
  `${CNCF_GENERATED_DIRECTORY}/flux`,
  `${CNCF_GENERATED_DIRECTORY}/gitea`,
  `${CNCF_GENERATED_DIRECTORY}/grpc`,
  `${CNCF_GENERATED_DIRECTORY}/hami`,
  `${CNCF_GENERATED_DIRECTORY}/harbor`,
  `${CNCF_GENERATED_DIRECTORY}/headlamp`,
  `${CNCF_GENERATED_DIRECTORY}/helm`,
  `${CNCF_GENERATED_DIRECTORY}/in-toto`,
  `${CNCF_GENERATED_DIRECTORY}/inspektor-gadget`,
  `${CNCF_GENERATED_DIRECTORY}/istio`,
  `${CNCF_GENERATED_DIRECTORY}/jaeger`,
  `${CNCF_GENERATED_DIRECTORY}/k0s`,
  `${CNCF_GENERATED_DIRECTORY}/k3s`,
  `${CNCF_GENERATED_DIRECTORY}/k8sgpt`,
  `${CNCF_GENERATED_DIRECTORY}/k8up`,
  `${CNCF_GENERATED_DIRECTORY}/kagent`,
  `${CNCF_GENERATED_DIRECTORY}/kagenti`,
  `${CNCF_GENERATED_DIRECTORY}/kanister`,
  `${CNCF_GENERATED_DIRECTORY}/kcp`,
  `${CNCF_GENERATED_DIRECTORY}/keda`,
  `${CNCF_GENERATED_DIRECTORY}/kepler`,
  `${CNCF_GENERATED_DIRECTORY}/keycloak`,
  `${CNCF_GENERATED_DIRECTORY}/keylime`,
  `${CNCF_GENERATED_DIRECTORY}/kgateway`,
  `${CNCF_GENERATED_DIRECTORY}/kmesh`,
  `${CNCF_GENERATED_DIRECTORY}/knative`,
  `${CNCF_GENERATED_DIRECTORY}/knative-eventing`,
  `${CNCF_GENERATED_DIRECTORY}/ko`,
  `${CNCF_GENERATED_DIRECTORY}/kong`,
  `${CNCF_GENERATED_DIRECTORY}/konveyor`,
  `${CNCF_GENERATED_DIRECTORY}/koordinator`,
  `${CNCF_GENERATED_DIRECTORY}/kpt`,
  `${CNCF_GENERATED_DIRECTORY}/kserve`,
  `${CNCF_GENERATED_DIRECTORY}/kube-burner`,
  `${CNCF_GENERATED_DIRECTORY}/kube-ovn`,
  `${CNCF_GENERATED_DIRECTORY}/kube-rs`,
  `${CNCF_GENERATED_DIRECTORY}/kube-vip`,
  `${CNCF_GENERATED_DIRECTORY}/kubearmor`,
  `${CNCF_GENERATED_DIRECTORY}/kubeedge`,
  `${CNCF_GENERATED_DIRECTORY}/kubefleet`,
  `${CNCF_GENERATED_DIRECTORY}/kubeflow`,
  `${CNCF_GENERATED_DIRECTORY}/kuberay`,
  `${CNCF_GENERATED_DIRECTORY}/kubernetes`,
  `${CNCF_GENERATED_DIRECTORY}/kubescape`,
  `${CNCF_GENERATED_DIRECTORY}/kubestellar`,
  `${CNCF_GENERATED_DIRECTORY}/kubevela`,
  `${CNCF_GENERATED_DIRECTORY}/kubevirt`,
  `${CNCF_GENERATED_DIRECTORY}/kudo`,
  `${CNCF_GENERATED_DIRECTORY}/kuma`,
  `${CNCF_GENERATED_DIRECTORY}/kured`,
  `${CNCF_GENERATED_DIRECTORY}/kyverno`,
  `${CNCF_GENERATED_DIRECTORY}/langflow`,
  `${CNCF_GENERATED_DIRECTORY}/lima`,
  `${CNCF_GENERATED_DIRECTORY}/linkerd`,
  `${CNCF_GENERATED_DIRECTORY}/litellm`,
  `${CNCF_GENERATED_DIRECTORY}/litmus`,
  `${CNCF_GENERATED_DIRECTORY}/localai`,
  `${CNCF_GENERATED_DIRECTORY}/logging-operator-kube-logging-`,
  `${CNCF_GENERATED_DIRECTORY}/longhorn`,
  `${CNCF_GENERATED_DIRECTORY}/meshery`,
  `${CNCF_GENERATED_DIRECTORY}/metal3-io`,
  `${CNCF_GENERATED_DIRECTORY}/metallb`,
  `${CNCF_GENERATED_DIRECTORY}/microcks`,
  `${CNCF_GENERATED_DIRECTORY}/milvus`,
  `${CNCF_GENERATED_DIRECTORY}/minio`,
  `${CNCF_GENERATED_DIRECTORY}/modelpack`,
  `${CNCF_GENERATED_DIRECTORY}/n8n`,
  `${CNCF_GENERATED_DIRECTORY}/nats`,
  `${CNCF_GENERATED_DIRECTORY}/netdata`,
  `${CNCF_GENERATED_DIRECTORY}/node-exporter`,
  `${CNCF_GENERATED_DIRECTORY}/notary-project`,
  `${CNCF_GENERATED_DIRECTORY}/oauth2-proxy`,
  `${CNCF_GENERATED_DIRECTORY}/ollama`,
  `${CNCF_GENERATED_DIRECTORY}/open-cluster-management`,
  `${CNCF_GENERATED_DIRECTORY}/open-policy-agent-opa-`,
  `${CNCF_GENERATED_DIRECTORY}/open-webui`,
  `${CNCF_GENERATED_DIRECTORY}/opencost`,
  `${CNCF_GENERATED_DIRECTORY}/openebs`,
  `${CNCF_GENERATED_DIRECTORY}/openeverest`,
  `${CNCF_GENERATED_DIRECTORY}/openfeature`,
  `${CNCF_GENERATED_DIRECTORY}/openfga`,
  `${CNCF_GENERATED_DIRECTORY}/openfunction`,
  `${CNCF_GENERATED_DIRECTORY}/opentelemetry`,
  `${CNCF_GENERATED_DIRECTORY}/opentelemetry-collector`,
  `${CNCF_GENERATED_DIRECTORY}/opentelemetry-operator`,
  `${CNCF_GENERATED_DIRECTORY}/opentofu`,
  `${CNCF_GENERATED_DIRECTORY}/operator-framework`,
  `${CNCF_GENERATED_DIRECTORY}/oras`,
  `${CNCF_GENERATED_DIRECTORY}/parsec`,
  `${CNCF_GENERATED_DIRECTORY}/perses`,
  `${CNCF_GENERATED_DIRECTORY}/piraeus-datastore`,
  `${CNCF_GENERATED_DIRECTORY}/podman-container-tools`,
  `${CNCF_GENERATED_DIRECTORY}/podman-desktop`,
  `${CNCF_GENERATED_DIRECTORY}/porter`,
  `${CNCF_GENERATED_DIRECTORY}/prometheus`,
  `${CNCF_GENERATED_DIRECTORY}/pushgateway`,
  `${CNCF_GENERATED_DIRECTORY}/qdrant`,
  `${CNCF_GENERATED_DIRECTORY}/radius`,
  `${CNCF_GENERATED_DIRECTORY}/redpanda`,
  `${CNCF_GENERATED_DIRECTORY}/rook`,
  `${CNCF_GENERATED_DIRECTORY}/schemahero`,
  `${CNCF_GENERATED_DIRECTORY}/score`,
  `${CNCF_GENERATED_DIRECTORY}/seaweedfs`,
  `${CNCF_GENERATED_DIRECTORY}/security-compliance`,
  `${CNCF_GENERATED_DIRECTORY}/serverless-workflow`,
  `${CNCF_GENERATED_DIRECTORY}/signoz`,
  `${CNCF_GENERATED_DIRECTORY}/slimtoolkit`,
  `${CNCF_GENERATED_DIRECTORY}/sops`,
  `${CNCF_GENERATED_DIRECTORY}/spin`,
  `${CNCF_GENERATED_DIRECTORY}/spire`,
  `${CNCF_GENERATED_DIRECTORY}/strimzi`,
  `${CNCF_GENERATED_DIRECTORY}/submariner`,
  `${CNCF_GENERATED_DIRECTORY}/surrealdb`,
  `${CNCF_GENERATED_DIRECTORY}/telepresence`,
  `${CNCF_GENERATED_DIRECTORY}/temporal`,
  `${CNCF_GENERATED_DIRECTORY}/tetragon`,
  `${CNCF_GENERATED_DIRECTORY}/thanos`,
  `${CNCF_GENERATED_DIRECTORY}/the-update-framework-tuf-`,
  `${CNCF_GENERATED_DIRECTORY}/tikv`,
  `${CNCF_GENERATED_DIRECTORY}/traefik`,
  `${CNCF_GENERATED_DIRECTORY}/trickster`,
  `${CNCF_GENERATED_DIRECTORY}/urunc`,
  `${CNCF_GENERATED_DIRECTORY}/valkey`,
  `${CNCF_GENERATED_DIRECTORY}/vault`,
  `${CNCF_GENERATED_DIRECTORY}/virtual-kubelet`,
  `${CNCF_GENERATED_DIRECTORY}/visual-studio-code-kubernetes-tools`,
  `${CNCF_GENERATED_DIRECTORY}/vitess`,
  `${CNCF_GENERATED_DIRECTORY}/vllm`,
  `${CNCF_GENERATED_DIRECTORY}/volcano`,
  `${CNCF_GENERATED_DIRECTORY}/wasmcloud`,
  `${CNCF_GENERATED_DIRECTORY}/wasmedge-runtime`,
  `${CNCF_GENERATED_DIRECTORY}/weaviate`,
  `${CNCF_GENERATED_DIRECTORY}/werf`,
  `${CNCF_GENERATED_DIRECTORY}/woodpecker-ci`,
]);

// See web/netlify/functions/_shared/cors.ts for allowlist rationale (#9879).
const CORS_OPTS = {
  methods: "GET, OPTIONS",
  headers: "Content-Type",
} as const;

interface GitHubEntry {
  type: string;
  name: string;
  path: string;
  size: number;
}

interface BrowseCacheEntry {
  body: string;
  fetchedAt: number;
  status: 200 | 404;
}

/** Fully decode a value to catch percent-encoded traversal attempts. */
function fullyDecode(value: string): string | null {
  let decoded = value;
  let previous = "";
  const MAX_DECODE_ITERATIONS = 5;

  for (let i = 0; i < MAX_DECODE_ITERATIONS && decoded !== previous; i++) {
    previous = decoded;
    try {
      decoded = decodeURIComponent(decoded);
    } catch {
      return null;
    }
  }

  return decoded;
}

function normalizeBrowsePath(value: string): string | null {
  const decoded = fullyDecode(value.trim());
  if (decoded === null) {
    return null;
  }

  return decoded.replace(/\/+$/, "");
}

function isAllowedMissionBrowsePath(value: string): boolean {
  return value === ROOT_MISSION_DIRECTORY
    || ALLOWED_MISSION_CATEGORY_PATHS.has(value)
    || ALLOWED_CNCF_GENERATED_PROJECT_PATHS.has(value);
}

/** Reject traversal, invalid characters, unknown prefixes, and oversized inputs. */
function hasInvalidPathInput(value: string): boolean {
  return (
    value.length > MAX_PATH_LENGTH ||
    value.includes("..") ||
    value.startsWith("/") ||
    value.includes("#") ||
    value.includes("?") ||
    value.includes("\\") ||
    value.includes("\0") ||
    !isAllowedMissionBrowsePath(value)
  );
}

function getCacheTtlMs(status: BrowseCacheEntry["status"]): number {
  return status === 404 ? NEGATIVE_CACHE_TTL_MS : CACHE_TTL_MS;
}

function getCacheControlHeader(status: BrowseCacheEntry["status"]): string {
  const maxAge = status === 404 ? NEGATIVE_CACHE_MAX_AGE_S : CDN_CACHE_MAX_AGE_S;
  return `public, max-age=${maxAge}`;
}

export default async (request: Request): Promise<Response> => {
  if (request.method === "OPTIONS") {
    return handlePreflight(request, CORS_OPTS);
  }

  const corsHeaders = buildCorsHeaders(request, CORS_OPTS);

  const url = new URL(request.url);
  const rawPath = url.searchParams.get("path") || "";
  const path = rawPath ? normalizeBrowsePath(rawPath) : "";
  if (path === null || !path || hasInvalidPathInput(path)) {
    return jsonResponse(corsHeaders, { error: "invalid path" }, 400);
  }
  const cacheKey = `browse:${path}`;

  try {
    // Check Netlify Blobs cache first
    const store = getStore("missions-cache");
    const cached = await store.get(cacheKey, { type: "json" }) as BrowseCacheEntry | null;
    if (cached && Date.now() - cached.fetchedAt < getCacheTtlMs(cached.status)) {
      return new Response(cached.body, {
        status: cached.status,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": getCacheControlHeader(cached.status),
          "X-Cache": "HIT",
          ...corsHeaders,
        },
      });
    }

    const rateLimit = await enforceSimpleRateLimit({
      storeName: RATE_LIMIT_STORE_NAME,
      prefix: RATE_LIMIT_PREFIX,
      subject: getClientIp(request),
      maxRequests: RATE_LIMIT_MAX_REQUESTS,
      windowMs: RATE_LIMIT_WINDOW_MS,
    });
    if (rateLimit.limited) {
      return rateLimitResponse(rateLimit.retryAfterSeconds, {
        "Cache-Control": RATE_LIMIT_RETRY_CACHE_CONTROL,
        ...corsHeaders,
      });
    }

    // Fetch from GitHub Contents API with retry for transient errors (#10966)
    const apiUrl = `${GITHUB_API_URL}/repos/${KB_REPO}/contents/${path}?ref=${DEFAULT_REF}`;
    let resp: Response | null = null;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, RETRY_BASE_DELAY_MS * (1 << (attempt - 1))));
      }
      resp = await fetch(apiUrl, {
        headers: { Accept: "application/vnd.github.v3+json" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      // Don't retry 4xx (client errors) — only transient 5xx
      if (resp.ok || resp.status < 500) break;
      console.warn(`[missions-browse] Upstream ${resp.status}, attempt ${attempt + 1}/${MAX_RETRIES + 1}`);
    }

    if (!resp) {
      return jsonResponse(corsHeaders, { error: "upstream request failed" }, 502);
    }

    if (resp.status === 404) {
      const body = JSON.stringify({ error: "directory not found" });
      const entry: BrowseCacheEntry = { body, fetchedAt: Date.now(), status: 404 };
      store.setJSON(cacheKey, entry).catch((err) => { console.warn("[missions-browse] blob cache write failed:", err instanceof Error ? err.message : err) });
      return new Response(body, {
        status: 404,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": getCacheControlHeader(404),
          "X-Cache": "MISS",
          ...corsHeaders,
        },
      });
    }

    if (!resp.ok) {
      // If GitHub fails but we have stale successful cache, serve it
      if (cached?.status === 200) {
        return new Response(cached.body, {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": getCacheControlHeader(200),
            "X-Cache": "STALE",
            ...corsHeaders,
          },
        });
      }
      const code = resp.status === 403 || resp.status === 429 ? "rate_limited" : "github_error";
      return jsonResponse(corsHeaders, { error: "upstream request failed", code }, 502);
    }

    // Guard against oversized upstream responses
    const contentLength = parseInt(resp.headers.get("content-length") ?? "0", 10);
    if (contentLength > MAX_RESPONSE_BYTES) {
      return jsonResponse(corsHeaders, { error: "upstream response too large" }, 502);
    }
    const rawText = await resp.text();
    if (rawText.length > MAX_RESPONSE_BYTES) {
      return jsonResponse(corsHeaders, { error: "upstream response too large" }, 502);
    }
    const ghEntries = JSON.parse(rawText) as GitHubEntry[];

    /** Files to hide from the browser — infrastructure/metadata, not missions */
    const HIDDEN_FILES = new Set([".gitkeep", "index.json", "search-state.json"]);
    /** Directories to hide from the browser */
    const HIDDEN_DIRS = new Set([".github"]);

    // Transform GitHub's "dir" type to "directory" (frontend expects this)
    // and filter out internal/infrastructure entries
    const entries = ghEntries
      .map((e) => ({
        name: e.name,
        path: e.path,
        type: e.type === "dir" ? "directory" : e.type,
        size: e.size || 0,
      }))
      .filter((e) => {
        // Skip dotfiles/dotdirs
        if (e.name.startsWith(".")) return false;
        // Skip known infrastructure files
        if (e.type === "file" && HIDDEN_FILES.has(e.name)) return false;
        // Skip known infrastructure directories
        if (e.type === "directory" && HIDDEN_DIRS.has(e.name)) return false;
        return true;
      });

    const body = JSON.stringify(entries);

    // Store in cache (best-effort, don't block response)
    const entry: BrowseCacheEntry = { body, fetchedAt: Date.now(), status: 200 };
    store.setJSON(cacheKey, entry).catch((err) => { console.warn("[missions-browse] blob cache write failed:", err instanceof Error ? err.message : err) });

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": getCacheControlHeader(200),
        "X-Cache": "MISS",
        ...corsHeaders,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("[missions-browse] Error:", message);
    return jsonResponse(corsHeaders, { error: "upstream request failed" }, 502);
  }
};

function jsonResponse(
  corsHeaders: Record<string, string>,
  data: Record<string, unknown>,
  status = 200,
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}
