/**
 * BlueprintLayout — layout computation for FlightPlanBlueprint.
 *
 * Produces a deterministic grid of cluster zones and project positions,
 * plus the dependency edges that link them.
 */

import type {
  MissionControlState,
  BlueprintLayout,
  LayoutRect,
  ProjectPosition,
  DependencyEdge,
} from './types'

// ---------------------------------------------------------------------------
// Integration label map
// ---------------------------------------------------------------------------

/** Labels for known integration patterns — focused on direct, primary integrations */
export const INTEGRATION_LABELS: Record<string, Record<string, string>> = {
  'cert-manager': { istio: 'mTLS', linkerd: 'mTLS certs', 'external-secrets': 'TLS certs', harbor: 'HTTPS certs', sigstore: 'signing certs' },
  prometheus: { grafana: 'dashboards', thanos: 'long-term storage', alertmanager: 'alerts', falco: 'metrics', 'trivy-operator': 'scan metrics', trivy: 'scan metrics', kyverno: 'policy metrics', kubearmor: 'security metrics', opentelemetry: 'metrics pipeline', harbor: 'registry metrics', sigstore: 'signing metrics', cilium: 'network metrics' },
  falco: { kyverno: 'defense layers', 'open-policy-agent': 'runtime + policy', kubearmor: 'runtime security' },
  cilium: { 'open-policy-agent': 'network + admission', istio: 'eBPF dataplane', kyverno: 'network policy' },
  istio: { jaeger: 'distributed traces', envoy: 'sidecar proxy' },
  grafana: { jaeger: 'trace UI', thanos: 'query', loki: 'log query', opentelemetry: 'OTLP data' },
  fluentd: { 'fluent-bit': 'log forwarding' },
  'fluent-bit': { loki: 'log shipping' },
  harbor: { trivy: 'image scanning', sigstore: 'image signing', kyverno: 'image policy' },
  kyverno: { sigstore: 'signature verify', kubearmor: 'policy + enforcement' },
  opentelemetry: { kyverno: 'policy traces', kubearmor: 'security traces', sigstore: 'signing traces' },
  kubearmor: { sigstore: 'workload attestation' },
  flux: { helm: 'chart releases' },
  argocd: { helm: 'chart sync' },
  'argo-cd': { helm: 'chart sync' },
  velero: { longhorn: 'volume backup', rook: 'snapshot backup' },
  keda: { nats: 'event scaler', strimzi: 'Kafka scaler' },
  dapr: { nats: 'pub/sub', strimzi: 'Kafka binding' },
  knative: { istio: 'ingress', contour: 'ingress alt' },
  spiffe: { spire: 'identity runtime' },
  etcd: { coredns: 'service discovery' },
  keycloak: { 'open-policy-agent': 'auth policy', 'cert-manager': 'HTTPS certs' },
  metallb: { contour: 'ingress LB' },
  'external-secrets': { 'external-secrets-operator': 'operator' },
  crossplane: { helm: 'provider-helm' },
}

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

/** Blueprint viewbox width (SVG units) */
const VB_W = 560

/** Minimum viewbox height (SVG units) */
const VB_H_MIN = 360

/** Outer padding from viewbox edge (SVG units) */
const LAYOUT_PADDING = 18

/** Height reserved for the phase timeline bar (SVG units) */
const TIMELINE_H = 30

/** Gap between cluster cells in the grid (SVG units) */
const CELL_GAP = 12

/** Inner horizontal padding inside each cluster zone (SVG units) */
const INNER_PAD_X = 20

/** Top padding inside each cluster zone (SVG units) — room for the zone label */
const INNER_PAD_TOP = 32

/** Bottom padding inside each cluster zone (SVG units) */
const INNER_PAD_BOT = 22

/** Minimum vertical spacing between project node rows (SVG units) */
const MIN_PROJ_ROW_SPACE = 50

// ---------------------------------------------------------------------------
// Layout computation
// ---------------------------------------------------------------------------

export function computeLayout(state: MissionControlState): BlueprintLayout {
  // Determine how many projects the densest cluster has — scale viewbox accordingly
  const clusterProjects = new Map<string, string[]>()
  for (const assignment of state.assignments) {
    // Include all assigned clusters, even empty ones (drop targets in blueprint)
    clusterProjects.set(assignment.clusterName, assignment.projectNames)
  }

  const clusterNames = Array.from(clusterProjects.keys())
  const clusterCount = clusterNames.length || 1
  const maxProjectsInCluster = Math.max(1, ...Array.from(clusterProjects.values()).map((p) => p.length))

  // Scale viewbox based on project density — more projects need more vertical space
  const projRows = Math.ceil(maxProjectsInCluster / 3)
  const VB_H = Math.max(VB_H_MIN, 160 + projRows * 80)
  const usableH = VB_H - LAYOUT_PADDING * 2 - TIMELINE_H - 10

  const cols = clusterCount <= 3 ? clusterCount : 2
  const rows = Math.ceil(clusterCount / cols)
  const cellW = (VB_W - LAYOUT_PADDING * 2 - (cols - 1) * CELL_GAP) / cols
  const cellH = (usableH - (rows - 1) * CELL_GAP) / rows

  const clusterRects = new Map<string, LayoutRect>()
  const projectPositions = new Map<string, ProjectPosition>()

  clusterNames.forEach((name, i) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    const rect: LayoutRect = {
      x: LAYOUT_PADDING + col * (cellW + CELL_GAP),
      y: LAYOUT_PADDING + row * (cellH + CELL_GAP),
      width: cellW,
      height: cellH,
    }
    clusterRects.set(name, rect)

    const projects = clusterProjects.get(name) ?? []
    const pCols = projects.length <= 2 ? Math.max(1, projects.length) : Math.min(3, projects.length)
    const pRows = projects.length > 0 ? Math.ceil(projects.length / pCols) : 0
    const innerW = rect.width - INNER_PAD_X * 2
    const innerH = rect.height - INNER_PAD_TOP - INNER_PAD_BOT
    const projSpaceX = innerW / pCols
    const projSpaceY = Math.max(innerH / pRows, MIN_PROJ_ROW_SPACE)

    projects.forEach((pName, j) => {
      const pCol = j % pCols
      const pRow = Math.floor(j / pCols)
      // Composite key: "clusterName/projectName" — allows same project on multiple clusters
      projectPositions.set(`${name}/${pName}`, {
        projectName: pName,
        cx: rect.x + INNER_PAD_X + projSpaceX * (pCol + 0.5),
        cy: rect.y + INNER_PAD_TOP + projSpaceY * (pRow + 0.5),
        clusterName: name,
      })
    })
  })

  // Reverse lookup: projectName → positions (supports multi-cluster)
  const projectPosByName = new Map<string, ProjectPosition[]>()
  for (const pos of projectPositions.values()) {
    const list = projectPosByName.get(pos.projectName) || []
    list.push(pos)
    projectPosByName.set(pos.projectName, list)
  }

  // Find all position pairs for two projects — both intra-cluster (same cluster)
  // and cross-cluster (different clusters) so edges are visible across the fleet
  function findEdgePairs(a: string, b: string): { from: ProjectPosition; to: ProjectPosition; cross: boolean }[] {
    const posA = projectPosByName.get(a)
    const posB = projectPosByName.get(b)
    if (!posA?.length || !posB?.length) return []
    const pairs: { from: ProjectPosition; to: ProjectPosition; cross: boolean }[] = []
    // Intra-cluster pairs (same cluster)
    for (const fa of posA) {
      for (const fb of posB) {
        if (fa.clusterName === fb.clusterName) pairs.push({ from: fa, to: fb, cross: false })
      }
    }
    // Cross-cluster pairs — for each instance of project A that has no intra-cluster
    // partner, connect to the nearest instance of project B on another cluster
    for (const fa of posA) {
      const hasIntraCluster = pairs.some(p => !p.cross && p.from.clusterName === fa.clusterName)
      if (!hasIntraCluster) {
        const crossTarget = posB.find(fb => fb.clusterName !== fa.clusterName)
        if (crossTarget) pairs.push({ from: fa, to: crossTarget, cross: true })
      }
    }
    // If no pairs at all, fall back to one cross-cluster edge
    if (pairs.length === 0) pairs.push({ from: posA[0], to: posB[0], cross: true })
    return pairs
  }

  const dependencyEdges: DependencyEdge[] = []
  const edgeSet = new Set<string>()

  // Explicit dependencies
  for (const project of state.projects) {
    for (const dep of project.dependencies) {
      const pairs = findEdgePairs(project.name, dep)
      for (const pair of pairs) {
        const key = `${pair.from.clusterName}:${project.name}->${dep}`
        if (!edgeSet.has(key)) {
          edgeSet.add(key)
          const label = INTEGRATION_LABELS[dep]?.[project.name] ?? INTEGRATION_LABELS[project.name]?.[dep]
          dependencyEdges.push({
            from: project.name,
            to: dep,
            crossCluster: pair.cross,
            label,
            fromPos: pair.from,
            toPos: pair.to,
          })
        }
      }
    }
  }

  // Implicit integration edges (not explicit deps, but known integrations)
  for (const [src, targets] of Object.entries(INTEGRATION_LABELS)) {
    if (!projectPosByName.has(src)) continue
    for (const [target, label] of Object.entries(targets)) {
      if (!projectPosByName.has(target)) continue
      const pairs = findEdgePairs(src, target)
      for (const pair of pairs) {
        const key1 = `${pair.from.clusterName}:${src}->${target}`
        const key2 = `${pair.from.clusterName}:${target}->${src}`
        if (!edgeSet.has(key1) && !edgeSet.has(key2)) {
          edgeSet.add(key1)
          dependencyEdges.push({
            from: src,
            to: target,
            crossCluster: pair.cross,
            label,
            fromPos: pair.from,
            toPos: pair.to,
          })
        }
      }
    }
  }

  return {
    clusterRects,
    projectPositions,
    dependencyEdges,
    viewBox: { width: VB_W, height: VB_H },
  }
}
