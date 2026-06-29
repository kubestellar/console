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

function writeTempKubeconfig(): string | undefined {
  if (process.env.KUBECONFIG_PATH) return process.env.KUBECONFIG_PATH
  if (process.env.KUBECONFIG) return process.env.KUBECONFIG
  const content = process.env.KUBECONFIG_B64
    ? Buffer.from(process.env.KUBECONFIG_B64, 'base64').toString('utf8')
    : process.env.KUBECONFIG_CONTENT
  if (!content) return undefined
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'visual-login-kubeconfig-'))
  const kubeconfigPath = path.join(dir, 'config')
  fs.writeFileSync(kubeconfigPath, content, { mode: 0o600 })
  return kubeconfigPath
}

function jsonList<T>(args: string[], kubeconfigPath?: string): T[] {
  try {
    const parsed = JSON.parse(kubectl([...args, '-o', 'json'], kubeconfigPath)) as KubectlJsonList<T>
    return parsed.items || []
  } catch {
    return []
  }
}

function jsonListAcrossContexts<T>(contexts: string[], args: string[], kubeconfigPath?: string): T[] {
  return contexts.flatMap(context => jsonList<T>(['--context', context, ...args], kubeconfigPath))
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

  let kubeconfigPath: string | undefined
  try {
    kubeconfigPath = writeTempKubeconfig()
    execFileSync('kubectl', ['version', '--client=true'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  } catch {
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

  const contexts = configuredContexts(kubeconfigPath)
  const reachable = contexts.filter(context => {
    try {
      kubectl(['--context', context, 'get', 'namespaces', '--request-timeout=10s'], kubeconfigPath)
      return true
    } catch {
      return false
    }
  })

  const groundTruth = normalizeK8sState({
    runId,
    contextNames: contexts,
    reachableContexts: reachable,
    nodes: jsonListAcrossContexts<K8sNode>(reachable, ['get', 'nodes'], kubeconfigPath),
    pods: jsonListAcrossContexts<K8sPod>(reachable, ['get', 'pods', '-A'], kubeconfigPath),
    namespaces: jsonListAcrossContexts<unknown>(reachable, ['get', 'namespaces'], kubeconfigPath),
    deployments: jsonListAcrossContexts<K8sDeployment>(reachable, ['get', 'deployments', '-A'], kubeconfigPath),
    createdNamespaces: [],
  })

  const redacted = redactK8sGroundTruth(groundTruth)
  const outDir = path.resolve(process.cwd(), 'test-results/reports')
  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(path.join(outDir, 'groundtruth.json'), safeJsonStringify(redacted))
  return redacted
}

if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
  const groundTruth = collectK8sGroundTruth()
  console.log(safeJsonStringify(groundTruth))
}
