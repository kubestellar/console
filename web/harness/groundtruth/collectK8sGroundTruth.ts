import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import type { K8sDeployment, K8sGroundTruth, K8sNode, K8sPod, KubectlJsonList } from './k8sTypes'
import { normalizeK8sState } from './normalizeK8sState'
import { redactK8sGroundTruth } from './redactK8sGroundTruth'
import { safeJsonStringify } from '../evidence/sanitizeEvidence'

function kubectl(args: string[], kubeconfigPath?: string): string {
  const fullArgs = kubeconfigPath ? ['--kubeconfig', kubeconfigPath, ...args] : args
  return execFileSync('kubectl', fullArgs, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

interface TempKubeconfig {
  path?: string
  cleanup: () => void
}

function writeTempKubeconfig(): TempKubeconfig {
  if (process.env.KUBECONFIG_PATH) return { path: process.env.KUBECONFIG_PATH, cleanup: () => {} }
  const content = process.env.KUBECONFIG_B64
    ? Buffer.from(process.env.KUBECONFIG_B64, 'base64').toString('utf8')
    : process.env.KUBECONFIG_CONTENT
  if (!content) return { cleanup: () => {} }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'visual-login-kubeconfig-'))
  const kubeconfigPath = path.join(dir, 'config')
  fs.writeFileSync(kubeconfigPath, content, { mode: 0o600 })
  return {
    path: kubeconfigPath,
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true }),
  }
}

const KUBECTL_LIST_REQUEST_TIMEOUT = '20s'
const KUBECTL_LIST_RETRY_CHUNK_SIZE = '100'
const PER_NAMESPACE_FALLBACK_BUDGET_MS = 30_000
const LISTING_ERROR_SNIPPET_LENGTH = 300

function describeKubectlError(error: unknown): string {
  const stderr = (error as { stderr?: unknown })?.stderr
  const message = typeof stderr === 'string' && stderr.trim()
    ? stderr.trim()
    : error instanceof Error ? error.message : String(error)
  // Keep the first line and strip URLs/IPs so evidence reports never leak
  // API server endpoints.
  return message.split(/\r?\n/)[0]
    .replace(/https?:\/\/\S+/g, '<url>')
    .replace(/\b\d{1,3}(\.\d{1,3}){3}(:\d+)?\b/g, '<ip>')
    .slice(0, LISTING_ERROR_SNIPPET_LENGTH)
}

function jsonListWithError<T>(args: string[], kubeconfigPath?: string): { items: T[]; error?: string } {
  try {
    const parsed = JSON.parse(kubectl([...args, '-o', 'json'], kubeconfigPath)) as KubectlJsonList<T>
    return { items: parsed.items || [] }
  } catch (error) {
    return { items: [], error: describeKubectlError(error) }
  }
}

// A silently-truncated listing is worse than a loud failure: run 33725278436
// compared UI totals against kubectl ground truth that was missing one whole
// context's pods (36 vs a truthful 127) because errors were swallowed here.
// Failures now retry cluster-scoped listing once (with pagination and a
// request timeout), then fall back to per-namespace listing under a time
// budget, and anything still incomplete is recorded so callers can refuse to
// treat the counts as exact.
function jsonListAcrossContexts<T>(
  contexts: string[],
  args: string[],
  kubeconfigPath: string | undefined,
  failures: Array<{ context: string; resource: string; error: string }>,
  resource: string,
  namespacedFallbackResource?: string,
): T[] {
  return contexts.flatMap(context => {
    const contextArgs = ['--context', context, ...args, `--request-timeout=${KUBECTL_LIST_REQUEST_TIMEOUT}`]
    const direct = jsonListWithError<T>(contextArgs, kubeconfigPath)
    if (!direct.error) return direct.items

    const retried = jsonListWithError<T>([...contextArgs, `--chunk-size=${KUBECTL_LIST_RETRY_CHUNK_SIZE}`], kubeconfigPath)
    if (!retried.error) return retried.items

    if (!namespacedFallbackResource) {
      failures.push({ context, resource, error: retried.error })
      return []
    }

    const namespaces = jsonListWithError<{ metadata?: { name?: string } }>(
      ['--context', context, 'get', 'namespaces', `--request-timeout=${KUBECTL_LIST_REQUEST_TIMEOUT}`],
      kubeconfigPath,
    )
    if (namespaces.error) {
      failures.push({ context, resource, error: `${retried.error}; namespace fallback unavailable: ${namespaces.error}` })
      return []
    }

    const items: T[] = []
    const fallbackErrors: string[] = []
    const fallbackStartedAt = Date.now()
    let ranOutOfBudget = false
    for (const namespace of namespaces.items) {
      const name = namespace.metadata?.name
      if (!name) continue
      if (Date.now() - fallbackStartedAt > PER_NAMESPACE_FALLBACK_BUDGET_MS) {
        ranOutOfBudget = true
        break
      }
      const scoped = jsonListWithError<T>(
        ['--context', context, 'get', namespacedFallbackResource, '-n', name, '--request-timeout=10s'],
        kubeconfigPath,
      )
      if (scoped.error) fallbackErrors.push(`${name}: ${scoped.error}`)
      else items.push(...scoped.items)
    }

    if (ranOutOfBudget || fallbackErrors.length > 0) {
      const reasons = [
        `cluster-scoped list failed: ${retried.error}`,
        ranOutOfBudget ? `per-namespace fallback exceeded ${PER_NAMESPACE_FALLBACK_BUDGET_MS}ms budget` : '',
        fallbackErrors.length > 0 ? `fallback failed for ${fallbackErrors.length} namespace(s): ${fallbackErrors.slice(0, 3).join('; ')}` : '',
      ].filter(Boolean).join('; ')
      failures.push({ context, resource, error: reasons })
    }
    return items
  })
}

function configuredContexts(kubeconfigPath?: string): string[] {
  const raw = kubectl(['config', 'get-contexts', '-o', 'name'], kubeconfigPath)
  const contexts = raw.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  const requested = (process.env.LIVE_CLUSTER_CONTEXTS || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
  return requested.length > 0 ? contexts.filter(context => requested.includes(context)) : contexts
}

export function collectK8sGroundTruth(runId = process.env.GITHUB_RUN_ID || String(Date.now())): K8sGroundTruth {
  if (process.env.LIVE_CLUSTER_TESTS !== 'true') {
    return {
      runId,
      skipped: 'LIVE_CLUSTER_TESTS is not true.',
      contexts: { configured: 0, reachable: 0, names: [] },
      nodes: { total: 0, ready: 0, notReady: 0 },
      pods: { total: 0, running: 0, pending: 0, failed: 0, crashLoopBackOff: 0 },
      namespaces: { total: 0, createdByHarness: [] },
      deployments: { total: 0, available: 0, unavailable: 0 },
    }
  }

  let kubeconfig: TempKubeconfig = { cleanup: () => {} }
  try {
    kubeconfig = writeTempKubeconfig()
    execFileSync('kubectl', ['version', '--client=true'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  } catch {
    kubeconfig.cleanup()
    return {
      runId,
      skipped: 'kubectl is unavailable or kubeconfig is not configured.',
      contexts: { configured: 0, reachable: 0, names: [] },
      nodes: { total: 0, ready: 0, notReady: 0 },
      pods: { total: 0, running: 0, pending: 0, failed: 0, crashLoopBackOff: 0 },
      namespaces: { total: 0, createdByHarness: [] },
      deployments: { total: 0, available: 0, unavailable: 0 },
    }
  }

  try {
    const kubeconfigPath = kubeconfig.path
    const contexts = configuredContexts(kubeconfigPath)
    const reachable = contexts.filter(context => {
      try {
        kubectl(['--context', context, 'get', 'namespaces', '--request-timeout=10s'], kubeconfigPath)
        return true
      } catch {
        return false
      }
    })

    const listingFailures: Array<{ context: string; resource: string; error: string }> = []
    const groundTruth = {
      ...normalizeK8sState({
        runId,
        contextNames: contexts,
        reachableContexts: reachable,
        nodes: jsonListAcrossContexts<K8sNode>(reachable, ['get', 'nodes'], kubeconfigPath, listingFailures, 'nodes'),
        pods: jsonListAcrossContexts<K8sPod>(reachable, ['get', 'pods', '-A'], kubeconfigPath, listingFailures, 'pods', 'pods'),
        namespaces: jsonListAcrossContexts<unknown>(reachable, ['get', 'namespaces'], kubeconfigPath, listingFailures, 'namespaces'),
        deployments: jsonListAcrossContexts<K8sDeployment>(reachable, ['get', 'deployments', '-A'], kubeconfigPath, listingFailures, 'deployments', 'deployments'),
        createdNamespaces: [],
      }),
      listingFailures,
    }

    const redacted = redactK8sGroundTruth(groundTruth)
    const outDir = path.resolve(process.cwd(), 'test-results/reports')
    fs.mkdirSync(outDir, { recursive: true })
    fs.writeFileSync(path.join(outDir, 'groundtruth.json'), safeJsonStringify(redacted))
    return redacted
  } finally {
    kubeconfig.cleanup()
  }
}

if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
  collectK8sGroundTruth()
}
