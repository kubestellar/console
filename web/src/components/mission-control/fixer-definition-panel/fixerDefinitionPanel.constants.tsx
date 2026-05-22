import type { ReactNode } from 'react'
import { Box, Eye, Layers, Lock, Network, Shield } from 'lucide-react'
import type { PayloadProject } from '../types'

export const PLACEHOLDER_EXAMPLES = [
  'Production-grade security compliance with runtime protection and policy enforcement...',
  'Full observability stack with metrics, tracing, and log aggregation across 3 clusters...',
  'Service mesh with mTLS, traffic management, and canary deployments...',
  'GitOps continuous delivery with automated rollbacks and multi-cluster sync...',
  'Edge computing platform with lightweight clusters and workload distribution...',
]

export interface ProjectAlternative {
  name: string
  displayName: string
  reason: string
}

export interface ManualWorkloadOption extends ProjectAlternative {
  category: string
  priority: PayloadProject['priority']
  dependencies: string[]
  kubaraChart?: {
    repoPath: string
  }
}

export const MANUAL_WORKLOAD_SUGGESTION_LIMIT = 8

const DEFAULT_MANUAL_WORKLOAD_CATEGORY = 'Suggested workload'
const DEFAULT_MANUAL_WORKLOAD_PRIORITY: PayloadProject['priority'] = 'recommended'
const MANUAL_WORKLOAD_NORMALIZE_REGEX = /[^a-z0-9]+/g
const MANUAL_WORKLOAD_SEPARATOR_REGEX = /[-_\s]+/g

export const ALTERNATIVES: Record<string, ProjectAlternative[]> = {
  falco: [
    { name: 'tetragon', displayName: 'Tetragon', reason: 'eBPF-based security observability by Cilium team' },
    { name: 'kubearmor', displayName: 'KubeArmor', reason: 'Runtime security enforcement using LSM' },
  ],
  'open-policy-agent': [
    { name: 'kyverno', displayName: 'Kyverno', reason: 'Kubernetes-native policy engine, no Rego needed' },
  ],
  kyverno: [
    { name: 'open-policy-agent', displayName: 'OPA Gatekeeper', reason: 'Rego-based policy engine, more flexible but steeper learning curve' },
  ],
  istio: [
    { name: 'linkerd', displayName: 'Linkerd', reason: 'Lighter service mesh with simpler operational model' },
    { name: 'cilium', displayName: 'Cilium Service Mesh', reason: 'eBPF-based mesh without sidecars' },
  ],
  linkerd: [
    { name: 'istio', displayName: 'Istio', reason: 'Feature-rich service mesh with Envoy proxy' },
  ],
  prometheus: [
    { name: 'thanos', displayName: 'Thanos', reason: 'Long-term Prometheus storage with global query' },
    { name: 'victoriametrics', displayName: 'VictoriaMetrics', reason: 'High-performance Prometheus-compatible TSDB' },
  ],
  cilium: [
    { name: 'calico', displayName: 'Calico', reason: 'Mature CNI with eBPF dataplane option' },
    { name: 'antrea', displayName: 'Antrea', reason: 'Kubernetes-native CNI using Open vSwitch' },
  ],
  'cert-manager': [
    { name: 'step-certificates', displayName: 'step-ca', reason: 'Smallstep CA for internal PKI' },
  ],
  'trivy-operator': [
    { name: 'grype', displayName: 'Grype', reason: 'Anchore vulnerability scanner' },
    { name: 'kubescape', displayName: 'Kubescape', reason: 'ARMO security posture scanning' },
  ],
  grype: [
    { name: 'trivy-operator', displayName: 'Trivy Operator', reason: 'Aqua vulnerability scanning for Kubernetes' },
    { name: 'kubescape', displayName: 'Kubescape', reason: 'ARMO security posture scanning' },
  ],
  kubescape: [
    { name: 'trivy-operator', displayName: 'Trivy Operator', reason: 'Aqua vulnerability scanning for Kubernetes' },
    { name: 'grype', displayName: 'Grype', reason: 'Anchore vulnerability scanner' },
  ],
  tetragon: [
    { name: 'falco', displayName: 'Falco', reason: 'Runtime threat detection via syscall monitoring' },
    { name: 'kubearmor', displayName: 'KubeArmor', reason: 'Runtime security enforcement using LSM' },
  ],
  kubearmor: [
    { name: 'falco', displayName: 'Falco', reason: 'Runtime threat detection via syscall monitoring' },
    { name: 'tetragon', displayName: 'Tetragon', reason: 'eBPF-based security observability by Cilium team' },
  ],
  calico: [
    { name: 'cilium', displayName: 'Cilium', reason: 'eBPF-based networking and security' },
    { name: 'antrea', displayName: 'Antrea', reason: 'Kubernetes-native CNI using Open vSwitch' },
  ],
}

export const ALTERNATIVES_DISPLAY: Record<string, ProjectAlternative> = {
  falco: { name: 'falco', displayName: 'Falco', reason: 'Runtime threat detection via syscall monitoring' },
  'open-policy-agent': { name: 'open-policy-agent', displayName: 'OPA Gatekeeper', reason: 'Rego-based policy engine for admission control' },
  kyverno: { name: 'kyverno', displayName: 'Kyverno', reason: 'Kubernetes-native policy engine' },
  istio: { name: 'istio', displayName: 'Istio', reason: 'Full-featured service mesh with Envoy proxy' },
  linkerd: { name: 'linkerd', displayName: 'Linkerd', reason: 'Lightweight service mesh' },
  prometheus: { name: 'prometheus', displayName: 'Prometheus', reason: 'CNCF monitoring and alerting toolkit' },
  cilium: { name: 'cilium', displayName: 'Cilium', reason: 'eBPF-based networking and security' },
  'cert-manager': { name: 'cert-manager', displayName: 'cert-manager', reason: 'Automated TLS certificate management' },
  'trivy-operator': { name: 'trivy-operator', displayName: 'Trivy Operator', reason: 'Aqua vulnerability scanning for Kubernetes' },
}

function createManualWorkloadOption(option: ProjectAlternative): ManualWorkloadOption {
  return {
    ...option,
    category: DEFAULT_MANUAL_WORKLOAD_CATEGORY,
    priority: DEFAULT_MANUAL_WORKLOAD_PRIORITY,
    dependencies: [],
  }
}

export function humanizeWorkloadName(name: string): string {
  return name
    .split(MANUAL_WORKLOAD_SEPARATOR_REGEX)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ')
}

export function normalizeManualWorkloadSearchText(value: string): string {
  return value.toLowerCase().replace(MANUAL_WORKLOAD_NORMALIZE_REGEX, '')
}

export function mergeManualWorkloadOptions(
  existing: ManualWorkloadOption[],
  incoming: ManualWorkloadOption[],
): ManualWorkloadOption[] {
  const merged = new Map<string, ManualWorkloadOption>()
  for (const option of [...existing, ...incoming]) {
    const key = option.name.toLowerCase()
    if (!merged.has(key)) merged.set(key, option)
  }
  return Array.from(merged.values()).sort((left, right) => left.displayName.localeCompare(right.displayName))
}

export function matchesManualWorkloadQuery(option: ManualWorkloadOption, query: string): boolean {
  const normalizedQuery = normalizeManualWorkloadSearchText(query)
  if (!normalizedQuery) return true
  return [option.name, option.displayName].some((value) =>
    normalizeManualWorkloadSearchText(value).includes(normalizedQuery),
  )
}

export function findManualWorkloadOption(
  options: ManualWorkloadOption[],
  input: string,
): ManualWorkloadOption | null {
  const normalizedInput = normalizeManualWorkloadSearchText(input)
  if (!normalizedInput) return null
  return options.find((option) =>
    normalizeManualWorkloadSearchText(option.name) === normalizedInput
    || normalizeManualWorkloadSearchText(option.displayName) === normalizedInput,
  ) ?? null
}

export function buildStaticManualWorkloadOptions(): ManualWorkloadOption[] {
  const alternatives = Object.values(ALTERNATIVES).flat().map(createManualWorkloadOption)
  const display = Object.values(ALTERNATIVES_DISPLAY).map(createManualWorkloadOption)
  return mergeManualWorkloadOptions([], [...display, ...alternatives])
}

const CATEGORY_ICONS: Record<string, ReactNode> = {
  Security: <Shield className="w-3 h-3 text-red-400" />,
  'Runtime Security': <Shield className="w-3 h-3 text-red-400" />,
  'Vulnerability Scanning': <Eye className="w-3 h-3 text-orange-400" />,
  'Policy Enforcement': <Lock className="w-3 h-3 text-amber-400" />,
  Networking: <Network className="w-3 h-3 text-sky-400" />,
  'Network Security': <Network className="w-3 h-3 text-sky-400" />,
  'Service Mesh': <Network className="w-3 h-3 text-cyan-400" />,
  Observability: <Eye className="w-3 h-3 text-blue-400" />,
  'Identity & Encryption': <Lock className="w-3 h-3 text-purple-400" />,
  'Authentication & IAM': <Lock className="w-3 h-3 text-purple-400" />,
  'Secrets Management': <Lock className="w-3 h-3 text-emerald-400" />,
  Storage: <Box className="w-3 h-3 text-green-400" />,
  Custom: <Layers className="w-3 h-3 text-slate-400" />,
}

export function CategoryIcon({ category }: { category: string }) {
  return CATEGORY_ICONS[category] ?? <Layers className="w-3 h-3 text-slate-400" />
}
