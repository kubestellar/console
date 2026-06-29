import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { safeJsonStringify } from '../evidence/sanitizeEvidence'

const DEFAULT_NAMESPACE = 'ks-live-ui-fixtures'
const FIXTURE_LABEL = 'kubestellar.io/live-ui-fixture=true'
let fixtureKubeconfigPath: string | undefined

export interface LiveFixtureReport {
  enabled: boolean
  skipped?: string
  namespace: string
  context?: string
  resources: {
    healthyDeployment: string
    imagePullPod: string
    pendingPod: string
    crashLoopPod: string
  }
  observed?: {
    pods: Array<{ name: string; phase?: string; reason?: string }>
    deploymentAvailable?: boolean
  }
}

function kubectl(args: string[], input?: string): string {
  const kubeconfigPath = fixtureKubeconfigPath || process.env.KUBECONFIG_PATH
  const fullArgs = kubeconfigPath
    ? ['--kubeconfig', kubeconfigPath, ...args]
    : args
  return execFileSync('kubectl', fullArgs, {
    encoding: 'utf8',
    input,
    stdio: input ? ['pipe', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe'],
  })
}

function writeTempKubeconfig(): string | undefined {
  if (fixtureKubeconfigPath || process.env.KUBECONFIG_PATH) return fixtureKubeconfigPath
  if (process.env.LIVE_CLUSTER_FIXTURE_KUBECONFIG_B64) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'live-fixture-kubeconfig-'))
    const kubeconfigPath = path.join(dir, 'config')
    fs.writeFileSync(kubeconfigPath, Buffer.from(process.env.LIVE_CLUSTER_FIXTURE_KUBECONFIG_B64, 'base64').toString('utf8'), { mode: 0o600 })
    fixtureKubeconfigPath = kubeconfigPath
    return fixtureKubeconfigPath
  }
  if (process.env.KUBECONFIG) return undefined
  const content = process.env.KUBECONFIG_B64
    ? Buffer.from(process.env.KUBECONFIG_B64, 'base64').toString('utf8')
    : process.env.KUBECONFIG_CONTENT
  if (!content) return undefined
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'live-fixture-kubeconfig-'))
  const kubeconfigPath = path.join(dir, 'config')
  fs.writeFileSync(kubeconfigPath, content, { mode: 0o600 })
  fixtureKubeconfigPath = kubeconfigPath
  return fixtureKubeconfigPath
}

function fixtureContext(): string | undefined {
  if (process.env.LIVE_CLUSTER_FIXTURE_CONTEXT) return process.env.LIVE_CLUSTER_FIXTURE_CONTEXT
  return (process.env.LIVE_CLUSTER_CONTEXTS || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)[0]
}

function fixtureNamespace(): string {
  return process.env.LIVE_FIXTURE_NAMESPACE || DEFAULT_NAMESPACE
}

function fixtureNames() {
  return {
    healthyDeployment: 'ks-live-ui-healthy',
    imagePullPod: 'ks-live-ui-imagepull',
    pendingPod: 'ks-live-ui-pending',
    crashLoopPod: 'ks-live-ui-crashloop',
  }
}

function fixtureManifest(namespace: string): string {
  const names = fixtureNames()
  return [
    `apiVersion: v1
kind: Namespace
metadata:
  name: ${namespace}
  labels:
    kubestellar.io/live-ui-fixture: "true"`,
    `apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${names.healthyDeployment}
  namespace: ${namespace}
  labels:
    kubestellar.io/live-ui-fixture: "true"
spec:
  replicas: 2
  selector:
    matchLabels:
      app.kubernetes.io/name: ${names.healthyDeployment}
      kubestellar.io/live-ui-fixture: "true"
  template:
    metadata:
      labels:
        app.kubernetes.io/name: ${names.healthyDeployment}
        kubestellar.io/live-ui-fixture: "true"
    spec:
      containers:
        - name: nginx
          image: nginx:1.27-alpine
          ports:
            - containerPort: 80
          resources:
            requests:
              cpu: 10m
              memory: 16Mi
            limits:
              cpu: 50m
              memory: 64Mi`,
    `apiVersion: v1
kind: Pod
metadata:
  name: ${names.imagePullPod}
  namespace: ${namespace}
  labels:
    kubestellar.io/live-ui-fixture: "true"
spec:
  restartPolicy: Never
  containers:
    - name: missing
      image: ghcr.io/kubestellar/console-live-ui-fixture-missing:never
      resources:
        requests:
          cpu: 10m
          memory: 16Mi
        limits:
          cpu: 50m
          memory: 64Mi`,
    `apiVersion: v1
kind: Pod
metadata:
  name: ${names.pendingPod}
  namespace: ${namespace}
  labels:
    kubestellar.io/live-ui-fixture: "true"
spec:
  restartPolicy: Never
  nodeSelector:
    kubestellar.io/nonexistent-node: "true"
  containers:
    - name: pause
      image: registry.k8s.io/pause:3.10
      resources:
        requests:
          cpu: 10m
          memory: 16Mi
        limits:
          cpu: 50m
          memory: 64Mi`,
    `apiVersion: v1
kind: Pod
metadata:
  name: ${names.crashLoopPod}
  namespace: ${namespace}
  labels:
    kubestellar.io/live-ui-fixture: "true"
spec:
  restartPolicy: Always
  containers:
    - name: crash
      image: busybox:1.36
      command: ["sh", "-c", "echo live-ui-fixture-crashloop && exit 1"]
      resources:
        requests:
          cpu: 10m
          memory: 16Mi
        limits:
          cpu: 50m
          memory: 64Mi`,
  ].join('\n---\n')
}

function withContext(args: string[], context?: string): string[] {
  return context ? ['--context', context, ...args] : args
}

function writeReport(report: LiveFixtureReport): LiveFixtureReport {
  const outDir = path.resolve(process.cwd(), 'test-results/reports')
  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(path.join(outDir, 'live-fixtures.json'), safeJsonStringify(report))
  return report
}

export function applyLiveFixtures(): LiveFixtureReport {
  const namespace = fixtureNamespace()
  const resources = fixtureNames()
  if (process.env.LIVE_CLUSTER_FIXTURES !== 'true') {
    return writeReport({ enabled: false, skipped: 'LIVE_CLUSTER_FIXTURES is not true.', namespace, resources })
  }

  writeTempKubeconfig()
  const context = fixtureContext()
  kubectl(withContext(['apply', '-f', '-'], context), fixtureManifest(namespace))
  kubectl(withContext(['-n', namespace, 'rollout', 'status', `deployment/${resources.healthyDeployment}`, '--timeout=90s'], context))
  return writeReport({ enabled: true, namespace, context, resources })
}

export function collectLiveFixtureState(): LiveFixtureReport {
  const namespace = fixtureNamespace()
  const resources = fixtureNames()
  if (process.env.LIVE_CLUSTER_FIXTURES !== 'true') {
    return writeReport({ enabled: false, skipped: 'LIVE_CLUSTER_FIXTURES is not true.', namespace, resources })
  }

  writeTempKubeconfig()
  const context = fixtureContext()
  const podsJson = JSON.parse(kubectl(withContext(['-n', namespace, 'get', 'pods', '-l', FIXTURE_LABEL, '-o', 'json'], context)))
  const deploymentJson = JSON.parse(kubectl(withContext(['-n', namespace, 'get', 'deployment', resources.healthyDeployment, '-o', 'json'], context)))
  const pods = (podsJson.items || []).map((pod: {
    metadata?: { name?: string }
    status?: {
      phase?: string
      containerStatuses?: Array<{ state?: { waiting?: { reason?: string } } }>
      conditions?: Array<{ reason?: string; type?: string; status?: string }>
    }
  }) => ({
    name: pod.metadata?.name || 'unknown',
    phase: pod.status?.phase,
    reason:
      pod.status?.containerStatuses?.find(status => status.state?.waiting?.reason)?.state?.waiting?.reason
      || pod.status?.conditions?.find(condition => condition.reason)?.reason,
  }))
  const availableReplicas = Number(deploymentJson.status?.availableReplicas || 0)
  const desiredReplicas = Number(deploymentJson.status?.replicas || 0)

  return writeReport({
    enabled: true,
    namespace,
    context,
    resources,
    observed: {
      pods,
      deploymentAvailable: desiredReplicas > 0 && availableReplicas >= desiredReplicas,
    },
  })
}

export function cleanupLiveFixtures(): LiveFixtureReport {
  const namespace = fixtureNamespace()
  const resources = fixtureNames()
  if (process.env.LIVE_CLUSTER_FIXTURES !== 'true') {
    return writeReport({ enabled: false, skipped: 'LIVE_CLUSTER_FIXTURES is not true.', namespace, resources })
  }
  if (process.env.LIVE_CLUSTER_FIXTURE_CLEANUP === 'false') {
    return collectLiveFixtureState()
  }

  writeTempKubeconfig()
  const context = fixtureContext()
  kubectl(withContext(['delete', 'namespace', namespace, '--ignore-not-found', '--wait=false'], context))
  return writeReport({ enabled: true, namespace, context, resources })
}
