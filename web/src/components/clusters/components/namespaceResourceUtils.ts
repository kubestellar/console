import { LB_PROVISIONING_LABEL, LB_STATUS_PROVISIONING } from '../../../lib/constants/network'
import type {
  PodInfo,
  Deployment,
  Service,
  Job,
  HPA,
  ConfigMap,
  Secret,
  ServiceAccount,
  PVC,
} from '../../../hooks/useMCP'

/** Service type string emitted by the backend for LoadBalancer services.
 * Defined as a constant to avoid magic strings. */
export const SERVICE_TYPE_LOAD_BALANCER = 'LoadBalancer'

export type ResourceKind = 'Pod' | 'Deployment' | 'Service' | 'Job' | 'HPA' | 'ConfigMap' | 'Secret' | 'ServiceAccount' | 'PVC'

export interface NamespaceResourceRow {
  kind: ResourceKind
  name: string
  namespace?: string
  status?: string
  statusColor: string
  detail?: string
  data?: Record<string, unknown>
}

export interface BuildAllResourcesParams {
  deployments: Deployment[]
  pods: PodInfo[]
  services: Service[]
  jobs: Job[]
  hpas: HPA[]
  configmaps: ConfigMap[]
  secrets: Secret[]
  serviceAccounts: ServiceAccount[]
  pvcs: PVC[]
}

/**
 * Builds the flat list of all namespace resources (used by the list view).
 * Extracted from NamespaceResources.tsx (#21617) as a pure function to
 * reduce the component's line count.
 */
export function buildAllResources({
  deployments,
  pods,
  services,
  jobs,
  hpas,
  configmaps,
  secrets,
  serviceAccounts,
  pvcs,
}: BuildAllResourcesParams): NamespaceResourceRow[] {
  const resources: NamespaceResourceRow[] = []

  deployments.forEach(dep => resources.push({
    kind: 'Deployment',
    name: dep.name,
    namespace: dep.namespace,
    status: dep.status,
    statusColor: dep.status === 'running' ? 'green' : dep.status === 'deploying' ? 'blue' : 'red',
    detail: `${dep.readyReplicas}/${dep.replicas}`,
    data: { replicas: dep.replicas, readyReplicas: dep.readyReplicas, image: dep.image, status: dep.status, age: dep.age }
  }))

  pods.forEach(pod => resources.push({
    kind: 'Pod',
    name: pod.name,
    namespace: pod.namespace,
    status: pod.status,
    statusColor: pod.status === 'Running' ? 'green' : pod.status === 'Pending' ? 'yellow' : 'red',
    detail: pod.ready,
    data: { status: pod.status, ready: pod.ready, restarts: pod.restarts, node: pod.node, age: pod.age }
  }))

  services.forEach(svc => {
    // Issue #6153: for LoadBalancer services with no ingress IP/
    // hostname assigned yet, display 'Provisioning' instead of an
    // empty string. We treat either the explicit lbStatus flag from
    // the backend OR a LoadBalancer type with a missing externalIP
    // (for older backends that do not set lbStatus) as provisioning.
    const isPendingLB =
      svc.type === SERVICE_TYPE_LOAD_BALANCER &&
      (svc.lbStatus === LB_STATUS_PROVISIONING || !svc.externalIP)
    const externalIPDisplay = isPendingLB
      ? LB_PROVISIONING_LABEL
      : svc.externalIP
    resources.push({
      kind: 'Service',
      name: svc.name,
      namespace: svc.namespace,
      status: svc.type,
      statusColor: 'cyan',
      detail: (svc.ports ?? []).slice(0, 2).join(', '),
      data: {
        type: svc.type,
        clusterIP: svc.clusterIP,
        externalIP: externalIPDisplay,
        endpoints: svc.endpoints,
        lbStatus: svc.lbStatus,
        ports: svc.ports,
        age: svc.age,
      },
    })
  })

  jobs.forEach(job => resources.push({
    kind: 'Job',
    name: job.name,
    namespace: job.namespace,
    status: job.status,
    statusColor: job.status === 'Complete' ? 'green' : job.status === 'Running' ? 'green' : 'red',
    detail: job.completions,
    data: { status: job.status, completions: job.completions, duration: job.duration, age: job.age }
  }))

  hpas.forEach(hpa => resources.push({
    kind: 'HPA',
    name: hpa.name,
    namespace: hpa.namespace,
    status: `${hpa.currentReplicas}/${hpa.minReplicas}-${hpa.maxReplicas}`,
    statusColor: 'purple',
    detail: hpa.reference,
    data: { reference: hpa.reference, minReplicas: hpa.minReplicas, maxReplicas: hpa.maxReplicas, currentReplicas: hpa.currentReplicas, targetCPU: hpa.targetCPU, currentCPU: hpa.currentCPU, age: hpa.age }
  }))

  configmaps.forEach(cm => resources.push({
    kind: 'ConfigMap',
    name: cm.name,
    namespace: cm.namespace,
    status: `${cm.dataCount} keys`,
    statusColor: 'orange',
    data: { dataCount: cm.dataCount, age: cm.age }
  }))

  secrets.forEach(secret => resources.push({
    kind: 'Secret',
    name: secret.name,
    namespace: secret.namespace,
    status: secret.type,
    statusColor: 'purple',
    detail: `${secret.dataCount} keys`,
    data: { type: secret.type, dataCount: secret.dataCount, age: secret.age }
  }))

  serviceAccounts.forEach(sa => resources.push({
    kind: 'ServiceAccount',
    name: sa.name,
    namespace: sa.namespace,
    status: `${sa.secrets?.length || 0} secrets`,
    statusColor: 'cyan',
    data: { secrets: sa.secrets, imagePullSecrets: sa.imagePullSecrets, age: sa.age }
  }))

  pvcs.forEach(pvc => resources.push({
    kind: 'PVC',
    name: pvc.name,
    namespace: pvc.namespace,
    status: pvc.status,
    statusColor: pvc.status === 'Bound' ? 'green' : pvc.status === 'Pending' ? 'yellow' : 'red',
    detail: pvc.capacity,
    data: { status: pvc.status, storageClass: pvc.storageClass, capacity: pvc.capacity, accessModes: pvc.accessModes, volumeName: pvc.volumeName, age: pvc.age }
  }))

  return resources
}

/** Maps a status "color" tag to Tailwind background/text classes. */
export function getStatusBgColor(color: string): string {
  switch (color) {
    case 'green': return 'bg-green-500/20 text-green-400'
    case 'blue': return 'bg-blue-500/20 text-blue-400'
    case 'yellow': return 'bg-yellow-500/20 text-yellow-400'
    case 'red': return 'bg-red-500/20 text-red-400'
    case 'cyan': return 'bg-cyan-500/20 text-cyan-400'
    case 'purple': return 'bg-purple-500/20 text-purple-400'
    case 'orange': return 'bg-orange-500/20 text-orange-400'
    default: return 'bg-gray-500/20 text-muted-foreground dark:bg-gray-400/20'
  }
}
