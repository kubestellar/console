/**
 * API Group → CNCF Project Cross-Reference
 *
 * Maps Kubernetes CRD API group domains to CNCF project identifiers used by
 * console-kb install missions. Used at runtime when parsing user-imported YAML
 * files to detect which CNCF projects are referenced and match them to
 * available install/fix missions.
 */

// ============================================================================
// Types
// ============================================================================

export interface ApiGroupMapping {
  /** CNCF project name matching console-kb's cncfProject field */
  project: string
  /** Tags for matcher scoring */
  tags: string[]
  /** console-kb install mission filename (without path) */
  installMission?: string
  /** Human-readable project display name */
  displayName: string
}

export interface DetectedApiGroup {
  /** Raw apiVersion string from the YAML document (e.g., "ray.io/v1alpha1") */
  apiVersion: string
  /** K8s resource kind (e.g., "RayCluster") */
  kind: string
  /** Resolved CNCF project mapping, or null if unknown */
  project: ApiGroupMapping | null
}

// ============================================================================
// Built-in K8s API groups (excluded from CNCF project detection)
// ============================================================================

const BUILTIN_API_GROUPS: ReadonlySet<string> = new Set([
  'apps',
  'batch',
  'extensions',
  'policy',
  'autoscaling',
  'networking.k8s.io',
  'storage.k8s.io',
  'rbac.authorization.k8s.io',
  'coordination.k8s.io',
  'node.k8s.io',
  'scheduling.k8s.io',
  'discovery.k8s.io',
  'flowcontrol.apiserver.k8s.io',
  'admissionregistration.k8s.io',
  'apiextensions.k8s.io',
  'apiregistration.k8s.io',
  'authentication.k8s.io',
  'authorization.k8s.io',
  'certificates.k8s.io',
  'events.k8s.io',
  'metrics.k8s.io',
  'internal.apiserver.k8s.io',
  'resource.k8s.io',
  'storagemigration.k8s.io',
])

// ============================================================================
// API Group → CNCF Project Mapping
// ============================================================================

/**
 * Maps CRD API group domains to CNCF project metadata.
 *
 * When a user imports a YAML file containing a Custom Resource, the apiVersion
 * field (e.g., "ray.io/v1alpha1") is parsed to extract the API group ("ray.io"),
 * which is then looked up here to determine which CNCF project it belongs to.
 *
 * The `installMission` field points to the console-kb filename so the UI can
 * offer "Use community install mission" or "Use my YAML instead" when composing
 * holistic missions.
 */
export const API_GROUP_TO_PROJECT: Record<string, ApiGroupMapping> = {
  // --- AI / ML / Inference ---
  'ray.io': { project: 'kuberay', tags: ['kuberay', 'ray', 'ml', 'inference'], installMission: 'install-kuberay.json', displayName: 'KubeRay' },

  // --- Multi-cluster ---
  'karmada.io': { project: 'karmada', tags: ['karmada', 'multi-cluster', 'federation'], installMission: 'install-karmada.json', displayName: 'Karmada' },
  'work.karmada.io': { project: 'karmada', tags: ['karmada', 'multi-cluster', 'federation'], installMission: 'install-karmada.json', displayName: 'Karmada' },
  'policy.karmada.io': { project: 'karmada', tags: ['karmada', 'multi-cluster', 'federation'], installMission: 'install-karmada.json', displayName: 'Karmada' },

  // --- GitOps ---
  'argoproj.io': { project: 'argocd', tags: ['argocd', 'gitops', 'continuous-delivery'], installMission: 'install-argocd.json', displayName: 'Argo CD' },
  'helm.toolkit.fluxcd.io': { project: 'flux', tags: ['flux', 'gitops', 'continuous-delivery'], installMission: 'install-flux.json', displayName: 'Flux' },
  'source.toolkit.fluxcd.io': { project: 'flux', tags: ['flux', 'gitops'], installMission: 'install-flux.json', displayName: 'Flux' },
  'kustomize.toolkit.fluxcd.io': { project: 'flux', tags: ['flux', 'gitops'], installMission: 'install-flux.json', displayName: 'Flux' },
  'notification.toolkit.fluxcd.io': { project: 'flux', tags: ['flux', 'gitops'], installMission: 'install-flux.json', displayName: 'Flux' },
  'image.toolkit.fluxcd.io': { project: 'flux', tags: ['flux', 'gitops'], installMission: 'install-flux.json', displayName: 'Flux' },

  // --- Certificates ---
  'cert-manager.io': { project: 'cert-manager', tags: ['cert-manager', 'tls', 'certificates'], installMission: 'install-cert-manager.json', displayName: 'cert-manager' },
  'acme.cert-manager.io': { project: 'cert-manager', tags: ['cert-manager', 'tls', 'certificates'], installMission: 'install-cert-manager.json', displayName: 'cert-manager' },

  // --- Monitoring / Observability ---
  'monitoring.coreos.com': { project: 'prometheus', tags: ['prometheus', 'monitoring', 'alertmanager'], installMission: 'install-prometheus.json', displayName: 'Prometheus' },
  'jaegertracing.io': { project: 'jaeger', tags: ['jaeger', 'tracing', 'observability'], installMission: 'install-jaeger.json', displayName: 'Jaeger' },
  'opentelemetry.io': { project: 'opentelemetry', tags: ['opentelemetry', 'tracing', 'observability'], installMission: 'install-opentelemetry.json', displayName: 'OpenTelemetry' },

  // --- Messaging / Streaming ---
  'kafka.strimzi.io': { project: 'strimzi', tags: ['strimzi', 'kafka', 'streaming'], installMission: 'install-strimzi.json', displayName: 'Strimzi' },
  'nats.io': { project: 'nats', tags: ['nats', 'messaging'], installMission: 'install-nats.json', displayName: 'NATS' },

  // --- Service Mesh ---
  'istio.io': { project: 'istio', tags: ['istio', 'service-mesh', 'envoy'], installMission: 'install-istio.json', displayName: 'Istio' },
  'networking.istio.io': { project: 'istio', tags: ['istio', 'service-mesh', 'envoy'], installMission: 'install-istio.json', displayName: 'Istio' },
  'security.istio.io': { project: 'istio', tags: ['istio', 'service-mesh'], installMission: 'install-istio.json', displayName: 'Istio' },
  'linkerd.io': { project: 'linkerd', tags: ['linkerd', 'service-mesh'], installMission: 'install-linkerd.json', displayName: 'Linkerd' },

  // --- Networking ---
  'gateway.networking.k8s.io': { project: 'gateway-api', tags: ['gateway', 'ingress', 'networking'], installMission: 'install-gateway-api.json', displayName: 'Gateway API' },
  'projectcontour.io': { project: 'contour', tags: ['contour', 'ingress'], installMission: 'install-contour.json', displayName: 'Contour' },

  // --- Autoscaling ---
  'keda.sh': { project: 'keda', tags: ['keda', 'autoscaling', 'scaling'], installMission: 'install-keda.json', displayName: 'KEDA' },

  // --- Progressive Delivery ---
  'flagger.app': { project: 'flagger', tags: ['flagger', 'canary', 'progressive-delivery'], installMission: 'install-flagger.json', displayName: 'Flagger' },

  // --- Serverless ---
  'serving.knative.dev': { project: 'knative', tags: ['knative', 'serverless'], installMission: 'install-knative.json', displayName: 'Knative' },
  'eventing.knative.dev': { project: 'knative', tags: ['knative', 'serverless', 'eventing'], installMission: 'install-knative.json', displayName: 'Knative' },

  // --- Infrastructure ---
  'crossplane.io': { project: 'crossplane', tags: ['crossplane', 'infrastructure', 'multi-cloud'], installMission: 'install-crossplane.json', displayName: 'Crossplane' },
  'pkg.crossplane.io': { project: 'crossplane', tags: ['crossplane', 'infrastructure'], installMission: 'install-crossplane.json', displayName: 'Crossplane' },

  // --- Backup ---
  'velero.io': { project: 'velero', tags: ['velero', 'backup', 'disaster-recovery'], installMission: 'install-velero.json', displayName: 'Velero' },

  // --- Security ---
  'falco.org': { project: 'falco', tags: ['falco', 'runtime-security'], installMission: 'install-falco.json', displayName: 'Falco' },
  'goharbor.io': { project: 'harbor', tags: ['harbor', 'registry', 'container-registry'], installMission: 'install-harbor.json', displayName: 'Harbor' },
  'kyverno.io': { project: 'kyverno', tags: ['kyverno', 'policy', 'security'], installMission: 'install-kyverno.json', displayName: 'Kyverno' },

  // --- Storage ---
  'longhorn.io': { project: 'longhorn', tags: ['longhorn', 'storage', 'persistent-volumes'], installMission: 'install-longhorn.json', displayName: 'Longhorn' },
  'rook.io': { project: 'rook', tags: ['rook', 'ceph', 'storage'], installMission: 'install-rook.json', displayName: 'Rook' },

  // --- Virtualization ---
  'kubevirt.io': { project: 'kubevirt', tags: ['kubevirt', 'virtualization', 'vm'], installMission: 'install-kubevirt.json', displayName: 'KubeVirt' },

  // --- Workflows ---
  'tekton.dev': { project: 'tekton', tags: ['tekton', 'ci-cd', 'pipelines'], installMission: 'install-tekton.json', displayName: 'Tekton' },

  // --- Edge ---
  'apps.kubeedge.io': { project: 'kubeedge', tags: ['kubeedge', 'edge', 'iot'], installMission: 'install-kubeedge.json', displayName: 'KubeEdge' },

  // --- Chaos Engineering ---
  'chaos-mesh.org': { project: 'chaos-mesh', tags: ['chaos-mesh', 'chaos-engineering', 'testing'], installMission: 'install-chaos-mesh.json', displayName: 'Chaos Mesh' },
  'litmuschaos.io': { project: 'litmus', tags: ['litmus', 'chaos-engineering'], installMission: 'install-litmus.json', displayName: 'Litmus' },
}

// ============================================================================
// Lookup Functions
// ============================================================================

/**
 * Extract the API group domain from a Kubernetes apiVersion string.
 *
 * Examples:
 *   "ray.io/v1alpha1"       → "ray.io"
 *   "apps/v1"               → null (built-in)
 *   "v1"                    → null (core API)
 *   "karmada.io/v1alpha2"   → "karmada.io"
 */
export function extractApiGroup(apiVersion: string): string | null {
  const slash = apiVersion.indexOf('/')
  if (slash <= 0) return null // core API (v1) — no custom group
  const group = apiVersion.substring(0, slash)
  if (BUILTIN_API_GROUPS.has(group)) return null
  return group
}

/**
 * Look up the CNCF project for a CRD API group.
 *
 * Tries exact match first, then checks if the input is a subdomain of a known
 * group (e.g., "config.karmada.io" matches "karmada.io").
 */
export function lookupProject(apiGroup: string): ApiGroupMapping | null {
  // Exact match
  const exact = API_GROUP_TO_PROJECT[apiGroup]
  if (exact) return exact

  // Subdomain match: "config.karmada.io" → try "karmada.io"
  for (const [group, mapping] of Object.entries(API_GROUP_TO_PROJECT)) {
    if (apiGroup.endsWith(`.${group}`)) {
      return mapping
    }
  }

  return null
}

/**
 * Deduplicate detected projects by project name.
 * Multiple CRs from the same project (e.g., RayCluster + RayJob) should
 * produce a single entry in the detected projects list.
 */
export function deduplicateProjects(mappings: ApiGroupMapping[]): ApiGroupMapping[] {
  const seen = new Set<string>()
  return mappings.filter((m) => {
    if (seen.has(m.project)) return false
    seen.add(m.project)
    return true
  })
}
