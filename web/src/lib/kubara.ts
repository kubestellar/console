import { MILLICORES_PER_CORE, MIB_PER_GIB, KIB_PER_MIB, GB_TO_MIB, MB_TO_MIB, BYTES_PER_MIB } from './constants/units'

/**
 * Kubara catalog utilities for Mission Control integration.
 *
 * Provides helpers to fetch the Kubara chart catalog index, retrieve
 * per-chart values.yaml contents, and parse resource requests from
 * Helm values so that Mission Control can:
 *   1. Include available chart names in AI suggestion context (#8481)
 *   2. Embed values.yaml into install prompts (#8482)
 *   3. Factor chart resource requests into cluster sizing (#8485)
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Timeout (ms) for fetching the Kubara catalog index */
const KUBARA_CATALOG_FETCH_TIMEOUT_MS = 8_000

/** Timeout (ms) for fetching a single chart's values.yaml */
const KUBARA_VALUES_FETCH_TIMEOUT_MS = 10_000

/** Default GitHub repo (owner/name) — overridden by /api/kubara/config */
const KUBARA_DEFAULT_REPO = 'kubara-io/kubara'

/** Default path inside the repo — overridden by /api/kubara/config */
const KUBARA_DEFAULT_PATH = 'go-binary/templates/embedded/managed-service-catalog/helm'

/** In-memory TTL for the catalog index cache (ms) — avoids redundant fetches */
const CATALOG_CACHE_TTL_MS = 5 * 60 * 1000

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single entry in the Kubara chart catalog */
interface KubaraChartEntry {
  /** Chart name (e.g. "kube-prometheus-stack") */
  name: string
  /** Relative path inside the repo (e.g. "go-binary/.../helm/kube-prometheus-stack") */
  path: string
  /** Optional description from the catalog */
  description?: string
}

/** Parsed resource requests from a chart's values.yaml */
export interface KubaraResourceRequests {
  /** CPU request (in millicores, e.g. 100 for "100m", 1000 for "1") */
  cpuMillicores: number
  /** Memory request (in MiB, e.g. 128 for "128Mi", 1024 for "1Gi") */
  memoryMiB: number
}

// ---------------------------------------------------------------------------
// In-memory catalog cache + server config
// ---------------------------------------------------------------------------

let cachedCatalog: KubaraChartEntry[] | null = null
let cachedCatalogTimestamp = 0

// Resolved once from /api/kubara/config; falls back to defaults if unreachable
let resolvedRepo = KUBARA_DEFAULT_REPO
let resolvedPath = KUBARA_DEFAULT_PATH
let configPromise: Promise<void> | null = null

async function ensureConfig(): Promise<void> {
  if (configPromise) return configPromise
  configPromise = (async () => {
    try {
      const res = await fetch('/api/kubara/config', {
        signal: AbortSignal.timeout(KUBARA_CATALOG_FETCH_TIMEOUT_MS),
      })
      if (res.ok) {
        const cfg = (await res.json()) as { repo?: string; path?: string }
        if (cfg.repo) resolvedRepo = cfg.repo
        if (cfg.path) resolvedPath = cfg.path
      }
    } catch {
      // Backend unreachable — allow retry on next call
      configPromise = null
    }
  })()
  return configPromise
}

// ---------------------------------------------------------------------------
// Static fallback catalog (used in demo mode and when fetch fails)
// ---------------------------------------------------------------------------

const STATIC_KUBARA_CHARTS: KubaraChartEntry[] = [
  { name: 'kube-prometheus-stack', path: `${KUBARA_DEFAULT_PATH}/kube-prometheus-stack`, description: 'Production Prometheus + Grafana + Alertmanager' },
  { name: 'cert-manager', path: `${KUBARA_DEFAULT_PATH}/cert-manager`, description: 'Automated TLS certificate management' },
  { name: 'kyverno', path: `${KUBARA_DEFAULT_PATH}/kyverno`, description: 'Kubernetes policy engine for security' },
  { name: 'kyverno-policies', path: `${KUBARA_DEFAULT_PATH}/kyverno-policies`, description: 'Curated Kyverno policy library' },
  { name: 'argo-cd', path: `${KUBARA_DEFAULT_PATH}/argo-cd`, description: 'Declarative GitOps continuous delivery' },
  { name: 'external-secrets', path: `${KUBARA_DEFAULT_PATH}/external-secrets`, description: 'Sync secrets from external providers' },
  { name: 'loki', path: `${KUBARA_DEFAULT_PATH}/loki`, description: 'Log aggregation system' },
  { name: 'longhorn', path: `${KUBARA_DEFAULT_PATH}/longhorn`, description: 'Cloud-native distributed storage' },
  { name: 'metallb', path: `${KUBARA_DEFAULT_PATH}/metallb`, description: 'Bare metal load balancer for Kubernetes' },
  { name: 'traefik', path: `${KUBARA_DEFAULT_PATH}/traefik`, description: 'Cloud-native ingress controller' },
]

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch the Kubara catalog index (list of available chart names).
 * Returns the static fallback in demo mode or on network error.
 * Results are cached in-memory for `CATALOG_CACHE_TTL_MS`.
 */
export async function fetchKubaraCatalog(): Promise<KubaraChartEntry[]> {
  // Return cached if still fresh
  const now = Date.now()
  if (cachedCatalog && now - cachedCatalogTimestamp < CATALOG_CACHE_TTL_MS) {
    return cachedCatalog
  }

  await ensureConfig()

  try {
    const url = `/api/github/repos/${resolvedRepo}/contents/${encodeURIComponent(resolvedPath)}`
    const response = await fetch(url, {
      signal: AbortSignal.timeout(KUBARA_CATALOG_FETCH_TIMEOUT_MS),
    })

    if (!response.ok) {
      cachedCatalog = STATIC_KUBARA_CHARTS
      cachedCatalogTimestamp = now
      return STATIC_KUBARA_CHARTS
    }

    const data: unknown = await response.json()
    if (!Array.isArray(data) || data.length === 0) {
      cachedCatalog = STATIC_KUBARA_CHARTS
      cachedCatalogTimestamp = now
      return STATIC_KUBARA_CHARTS
    }

    const entries: KubaraChartEntry[] = (data as Array<Record<string, unknown>>)
      .filter((item) => item.type === 'directory' || item.type === 'dir')
      .map((item) => ({
        name: String(item.name ?? ''),
        path: String(item.path ?? ''),
        description: typeof item.description === 'string' ? item.description : undefined,
      }))
      .filter((e) => e.name.length > 0)

    cachedCatalog = entries.length > 0 ? entries : STATIC_KUBARA_CHARTS
    cachedCatalogTimestamp = now
    return cachedCatalog
  } catch {
    // Network error, timeout, parse error — fall back to static catalog
    cachedCatalog = STATIC_KUBARA_CHARTS
    cachedCatalogTimestamp = now
    return STATIC_KUBARA_CHARTS
  }
}

/**
 * Fetch the raw values.yaml content for a specific Kubara chart.
 * Returns `null` on any failure (network error, 404, timeout).
 *
 * @param chartName  The chart directory name (e.g. "cert-manager")
 * @param valuesUrl  Optional override URL — if provided, fetches from
 *                   that URL directly instead of the default Kubara path.
 */
export async function fetchKubaraValues(
  chartName: string,
  valuesUrl?: string,
): Promise<string | null> {
  try {
    await ensureConfig()
    const url = valuesUrl
      ?? `/api/github/repos/${resolvedRepo}/contents/${encodeURIComponent(`${resolvedPath}/${chartName}/values.yaml`)}`
    const response = await fetch(url, {
      signal: AbortSignal.timeout(KUBARA_VALUES_FETCH_TIMEOUT_MS),
    })

    if (!response.ok) return null

    const text = await response.text()
    return text || null
  } catch {
    return null
  }
}

/**
 * Parse resource requests (CPU + memory) from a values.yaml string.
 * Looks for the `resources.requests` block and extracts `cpu` and `memory`.
 *
 * Returns `null` if the values don't contain parseable resource requests.
 */
export function parseResourceRequests(valuesYaml: string): KubaraResourceRequests | null {
  // Simple YAML regex parsing — avoids pulling in a full YAML library.
  // Matches patterns like:
  //   resources:
  //     requests:
  //       cpu: 100m
  //       memory: 128Mi
  const resourcesBlock = valuesYaml.match(
    /resources:\s*\n\s+requests:\s*\n((?:\s+\w+:.*\n?)*)/,
  )
  if (!resourcesBlock) return null

  const block = resourcesBlock[1]
  const cpuMatch = block.match(/cpu:\s*["']?(\d+m?|\d+\.?\d*)["']?/)
  const memMatch = block.match(/memory:\s*["']?(\d+(?:Mi|Gi|Ki|M|G)?)["']?/)

  if (!cpuMatch && !memMatch) return null

  return {
    cpuMillicores: cpuMatch ? parseCpuToMillicores(cpuMatch[1]) : 0,
    memoryMiB: memMatch ? parseMemoryToMiB(memMatch[1]) : 0,
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Convert a Kubernetes CPU string (e.g. "100m", "0.5", "1") to millicores */
function parseCpuToMillicores(cpu: string): number {
  if (cpu.endsWith('m')) {
    return parseInt(cpu.slice(0, -1), 10) || 0
  }
  return Math.round((parseFloat(cpu) || 0) * MILLICORES_PER_CORE)
}

/** Convert a Kubernetes memory string (e.g. "128Mi", "1Gi", "512M") to MiB */
function parseMemoryToMiB(mem: string): number {
  if (mem.endsWith('Gi')) return Math.round((parseFloat(mem) || 0) * MIB_PER_GIB)
  if (mem.endsWith('Mi')) return Math.round(parseFloat(mem) || 0)
  if (mem.endsWith('Ki')) return Math.round((parseFloat(mem) || 0) / KIB_PER_MIB)
  if (mem.endsWith('G')) return Math.round((parseFloat(mem) || 0) * GB_TO_MIB)
  if (mem.endsWith('M')) return Math.round((parseFloat(mem) || 0) * MB_TO_MIB)
  return Math.round((parseFloat(mem) || 0) / BYTES_PER_MIB)
}
