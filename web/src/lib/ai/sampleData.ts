/**
 * Heuristic sample data generator for live preview auto-population.
 * Detects field semantics from column names and generates realistic Kubernetes-themed data.
 */

import type { DynamicCardColumn } from '../dynamic-cards/types'

const K8S_NAMES = [
  'api-server-1', 'worker-node-3', 'etcd-backup-2', 'ingress-ctrl-1',
  'scheduler-main', 'coredns-7f9c', 'kube-proxy-4b2', 'metrics-srv-1',
  'cert-manager-5a', 'redis-cache-2',
]

const NAMESPACES = [
  'default', 'kube-system', 'production', 'staging', 'monitoring',
  'istio-system', 'cert-manager', 'logging', 'ingress-nginx', 'argocd',
]

const CLUSTERS = [
  'us-east-prod', 'eu-west-staging', 'ap-south-dev', 'us-west-dr',
  'eu-central-prod',
]

const STATUS_VALUES = ['Running', 'Pending', 'Failed', 'Succeeded', 'Unknown']
const HEALTH_VALUES = ['Healthy', 'Degraded', 'Critical', 'Unknown']
const PHASE_VALUES = ['Active', 'Terminating', 'Pending']
const BOOLEAN_VALUES = ['true', 'false']

interface FieldSemantics {
  pattern: RegExp
  generate: (rowIdx: number) => unknown
}

const FIELD_HEURISTICS: FieldSemantics[] = [
  { pattern: /^(pod_?)?name$|^resource$/i, generate: (i) => K8S_NAMES[i % K8S_NAMES.length] },
  { pattern: /^namespace$/i, generate: (i) => NAMESPACES[i % NAMESPACES.length] },
  { pattern: /^cluster$/i, generate: (i) => CLUSTERS[i % CLUSTERS.length] },
  { pattern: /^status$/i, generate: (i) => STATUS_VALUES[i % STATUS_VALUES.length] },
  { pattern: /^health$/i, generate: (i) => HEALTH_VALUES[i % HEALTH_VALUES.length] },
  { pattern: /^phase$/i, generate: (i) => PHASE_VALUES[i % PHASE_VALUES.length] },
  { pattern: /^ready$/i, generate: (i) => BOOLEAN_VALUES[i % 2] },
  { pattern: /^restarts?$/i, generate: (i) => [0, 0, 2, 5, 0][i % 5] },
  { pattern: /^(replicas?|count|total|instances?)$/i, generate: (i) => [3, 1, 5, 2, 4][i % 5] },
  { pattern: /^(desired|available|ready_?replicas)$/i, generate: (i) => [3, 1, 5, 2, 4][i % 5] },
  { pattern: /^cpu$/i, generate: (i) => ['250m', '500m', '1', '100m', '2'][i % 5] },
  { pattern: /^memory$/i, generate: (i) => ['256Mi', '512Mi', '1Gi', '128Mi', '2Gi'][i % 5] },
  { pattern: /^age$/i, generate: (i) => ['5d', '12h', '3d', '1h', '30d'][i % 5] },
  { pattern: /^version$/i, generate: (i) => ['v1.28.3', 'v1.27.8', 'v1.29.0', 'v1.28.1', 'v1.27.5'][i % 5] },
  { pattern: /^type$/i, generate: (i) => ['Deployment', 'StatefulSet', 'DaemonSet', 'Job', 'CronJob'][i % 5] },
  { pattern: /^node$/i, generate: (i) => [`node-${i + 1}`, `worker-${i + 1}`][i % 2] },
  { pattern: /^ip$|^address$/i, generate: (i) => `10.0.${i}.${100 + i}` },
  { pattern: /^port$/i, generate: (i) => [80, 443, 8080, 3000, 6379][i % 5] },
  { pattern: /^(image|container)$/i, generate: (i) => [`nginx:1.${25 + i}`, `redis:7.${i}`, `postgres:16.${i}`][i % 3] },
  { pattern: /^(created|updated|timestamp|time|date)$/i, generate: (i) => {
    const d = new Date(); d.setDate(d.getDate() - i * 3); return d.toISOString().split('T')[0]
  }},
  { pattern: /^(label|tag)s?$/i, generate: (i) => [`app=web`, `env=prod`, `team=platform`, `tier=backend`, `app=api`][i % 5] },
  { pattern: /^(percent|pct|usage|utilization)$/i, generate: (i) => [45, 72, 18, 91, 33][i % 5] },
]

const ROW_COUNT = 5

function generateFieldValue(fieldName: string, rowIdx: number): unknown {
  for (const heuristic of FIELD_HEURISTICS) {
    if (heuristic.pattern.test(fieldName)) {
      return heuristic.generate(rowIdx)
    }
  }
  return `value-${rowIdx + 1}`
}

export function generateSampleData(columns: DynamicCardColumn[]): Record<string, unknown>[] {
  if (columns.length === 0) return []

  const rows: Record<string, unknown>[] = []
  for (let i = 0; i < ROW_COUNT; i++) {
    const row: Record<string, unknown> = {}
    for (const col of columns) {
      if (col.field) {
        row[col.field] = generateFieldValue(col.field, i)
      }
    }
    rows.push(row)
  }
  return rows
}

export function detectFieldFormat(
  fieldName: string,
  sampleValues: unknown[],
): { format: 'text' | 'badge' | 'number'; badgeColors?: Record<string, string> } {
  const lowerField = fieldName.toLowerCase()

  if (/^(status|health|phase|state|ready)$/.test(lowerField)) {
    const uniqueVals = [...new Set(sampleValues.map(String))]
    if (uniqueVals.length <= 6) {
      const COLOR_MAP: Record<string, string> = {
        running: 'bg-green-500/20 text-green-400',
        healthy: 'bg-green-500/20 text-green-400',
        active: 'bg-green-500/20 text-green-400',
        succeeded: 'bg-green-500/20 text-green-400',
        true: 'bg-green-500/20 text-green-400',
        pending: 'bg-yellow-500/20 text-yellow-400',
        degraded: 'bg-yellow-500/20 text-yellow-400',
        terminating: 'bg-yellow-500/20 text-yellow-400',
        failed: 'bg-red-500/20 text-red-400',
        critical: 'bg-red-500/20 text-red-400',
        error: 'bg-red-500/20 text-red-400',
        false: 'bg-red-500/20 text-red-400',
        unknown: 'bg-gray-500/20 text-gray-400',
      }
      const badgeColors: Record<string, string> = {}
      for (const v of uniqueVals) {
        badgeColors[v] = COLOR_MAP[v.toLowerCase()] || 'bg-blue-500/20 text-blue-400'
      }
      return { format: 'badge', badgeColors }
    }
  }

  if (/^(restarts?|count|total|replicas?|port|instances?|desired|available|percent|pct|usage)$/.test(lowerField)) {
    return { format: 'number' }
  }

  if (sampleValues.length > 0 && sampleValues.every(v => typeof v === 'number')) {
    return { format: 'number' }
  }

  return { format: 'text' }
}
