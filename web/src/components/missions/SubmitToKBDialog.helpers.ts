import type { Resolution } from '../../hooks/useResolutions'
import type { MissionClass } from '../../lib/missions/types'

/** GitHub repo for the knowledge base */
export const CONSOLE_KB_OWNER = 'kubestellar'
export const CONSOLE_KB_REPO = 'console-kb'

/** Default branch for new file PRs */
export const CONSOLE_KB_BRANCH = 'master'

/** Max URL length for GitHub new-file links (browsers typically support ~8000) */
export const MAX_GITHUB_URL_LENGTH = 7500

/**
 * Map of keywords found in resolution titles, error patterns, namespaces, and
 * operator lists to their canonical CNCF project name.
 * Checked against title, steps, namespace, operators, and resourceKind.
 */
export const CNCF_PROJECT_KEYWORDS: Record<string, string> = {
  kyverno: 'Kyverno',
  kubescape: 'Kubescape',
  kubevuln: 'Kubescape',
  trivy: 'Trivy',
  istio: 'Istio',
  'argo cd': 'Argo CD',
  argocd: 'Argo CD',
  argo: 'Argo CD',
  'argo-rollouts': 'Argo Rollouts',
  prometheus: 'Prometheus',
  grafana: 'Grafana',
  jaeger: 'Jaeger',
  linkerd: 'Linkerd',
  envoy: 'Envoy',
  contour: 'Contour',
  'cert-manager': 'cert-manager',
  certmanager: 'cert-manager',
  falco: 'Falco',
  flux: 'Flux',
  fluxcd: 'Flux',
  'open policy agent': 'OPA',
  opa: 'OPA',
  gatekeeper: 'OPA Gatekeeper',
  etcd: 'etcd',
  coredns: 'CoreDNS',
  helm: 'Helm',
  harbor: 'Harbor',
  'cloud native buildpacks': 'Buildpacks',
  buildpack: 'Buildpacks',
  crossplane: 'Crossplane',
  thanos: 'Thanos',
  fluentd: 'Fluentd',
  'fluent bit': 'Fluent Bit',
  cilium: 'Cilium',
  calico: 'Calico',
  rook: 'Rook',
  vitess: 'Vitess',
  tikv: 'TiKV',
  nats: 'NATS',
  knative: 'Knative',
  dapr: 'Dapr',
  'open telemetry': 'OpenTelemetry',
  opentelemetry: 'OpenTelemetry',
  otel: 'OpenTelemetry',
  spiffe: 'SPIFFE',
  spire: 'SPIRE',
  longhorn: 'Longhorn',
  backstage: 'Backstage',
  'kube-virt': 'KubeVirt',
  kubevirt: 'KubeVirt',
  'virtual machine': 'KubeVirt',
  volcano: 'Volcano',
  keptn: 'Keptn',
  'kubestellar': 'KubeStellar' }

/** Try to detect the CNCF project from a resolution's context */
export function detectCNCFProject(resolution: Resolution): string {
  const searchTexts = [
    resolution.title,
    resolution.issueSignature.type,
    resolution.issueSignature.errorPattern || '',
    resolution.issueSignature.namespace || '',
    resolution.issueSignature.resourceKind || '',
    resolution.resolution.summary || '',
    ...resolution.resolution.steps,
    ...(resolution.context.operators || []),
  ].join(' ').toLowerCase()

  for (const op of (resolution.context.operators || [])) {
    const opLower = op.toLowerCase()
    for (const [keyword, project] of Object.entries(CNCF_PROJECT_KEYWORDS)) {
      if (opLower === keyword || opLower.includes(keyword)) return project
    }
  }

  const titleAndNs = [
    resolution.title,
    resolution.issueSignature.namespace || '',
  ].join(' ').toLowerCase()

  for (const [keyword, project] of Object.entries(CNCF_PROJECT_KEYWORDS)) {
    if (titleAndNs.includes(keyword)) return project
  }

  for (const [keyword, project] of Object.entries(CNCF_PROJECT_KEYWORDS)) {
    if (searchTexts.includes(keyword)) return project
  }

  return ''
}

/**
 * Convert a Resolution into the console-kb nested file format.
 * console-kb uses: { mission: { steps, ... }, metadata: { ... } }
 */
export function resolutionToKBFormat(
  resolution: Resolution,
  missionClass: MissionClass,
  cncfProject: string,
): Record<string, unknown> {
  const steps = resolution.resolution.steps.map((step, i) => ({
    title: `Step ${i + 1}`,
    description: step }))

  const mission: Record<string, unknown> = {
    steps }

  if (missionClass === 'fixer' && resolution.resolution.summary) {
    mission.troubleshooting = [
      {
        title: resolution.issueSignature.type,
        description: resolution.resolution.summary },
    ]
  }

  if (resolution.resolution.summary || resolution.resolution.steps.length > 0) {
    mission.resolution = {
      summary: resolution.resolution.summary,
      steps: resolution.resolution.steps,
      ...(resolution.resolution.yaml ? { yaml: resolution.resolution.yaml } : {}) }
  }

  return {
    version: 'kc-mission-v1',
    title: resolution.title,
    description: resolution.resolution.summary || resolution.title,
    type: missionClass === 'install' ? 'deploy' : 'troubleshoot',
    missionClass,
    tags: [
      resolution.issueSignature.type,
      ...(resolution.issueSignature.resourceKind ? [resolution.issueSignature.resourceKind] : []),
      ...(cncfProject ? [cncfProject] : []),
    ].filter(Boolean),
    category: missionClass === 'install' ? 'installation' : 'troubleshooting',
    ...(cncfProject ? { cncfProject } : {}),
    ...(resolution.issueSignature.resourceKind ? { resourceKind: resolution.issueSignature.resourceKind } : {}),
    mission,
    metadata: {
      author: resolution.sharedBy || resolution.userId,
      source: 'kubestellar-console',
      createdAt: resolution.createdAt,
      updatedAt: resolution.updatedAt } }
}

/** Generate a filesystem-safe filename from the resolution title */
export function generateFilename(title: string, missionClass: MissionClass): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
  const prefix = missionClass === 'install' ? 'install' : 'fixer'
  return `${prefix}-${slug}.json`
}
