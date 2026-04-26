interface K8sKindMeta {
  kind: string
  clusterScoped: boolean
  label: string
  group: string
}

export const ORBIT_CLUSTER_SCOPED_KINDS: K8sKindMeta[] = [
  { kind: 'Node', clusterScoped: true, label: 'Node', group: 'Infrastructure' },
  { kind: 'Namespace', clusterScoped: true, label: 'Namespace', group: 'Infrastructure' },
  { kind: 'PersistentVolume', clusterScoped: true, label: 'PersistentVolume', group: 'Storage' },
  { kind: 'StorageClass', clusterScoped: true, label: 'StorageClass', group: 'Storage' },
  { kind: 'ClusterRole', clusterScoped: true, label: 'ClusterRole', group: 'RBAC' },
  { kind: 'ClusterRoleBinding', clusterScoped: true, label: 'ClusterRoleBinding', group: 'RBAC' },
  { kind: 'CustomResourceDefinition', clusterScoped: true, label: 'CRD', group: 'Extensions' },
]

export const ORBIT_NAMESPACED_KINDS: K8sKindMeta[] = [
  { kind: 'Deployment', clusterScoped: false, label: 'Deployment', group: 'Workloads' },
  { kind: 'StatefulSet', clusterScoped: false, label: 'StatefulSet', group: 'Workloads' },
  { kind: 'DaemonSet', clusterScoped: false, label: 'DaemonSet', group: 'Workloads' },
  { kind: 'Pod', clusterScoped: false, label: 'Pod', group: 'Workloads' },
  { kind: 'Job', clusterScoped: false, label: 'Job', group: 'Workloads' },
  { kind: 'CronJob', clusterScoped: false, label: 'CronJob', group: 'Workloads' },
  { kind: 'Service', clusterScoped: false, label: 'Service', group: 'Networking' },
  { kind: 'Ingress', clusterScoped: false, label: 'Ingress', group: 'Networking' },
  { kind: 'ConfigMap', clusterScoped: false, label: 'ConfigMap', group: 'Config' },
  { kind: 'Secret', clusterScoped: false, label: 'Secret', group: 'Config' },
  { kind: 'PersistentVolumeClaim', clusterScoped: false, label: 'PVC', group: 'Storage' },
  { kind: 'HorizontalPodAutoscaler', clusterScoped: false, label: 'HPA', group: 'Scaling' },
  { kind: 'ResourceQuota', clusterScoped: false, label: 'ResourceQuota', group: 'Governance' },
]

/** Default resource kinds pre-selected when suggesting an orbit after a mission completes */
export const DEFAULT_MONITOR_KINDS: Array<{ kind: string; clusterScoped: boolean; namespaces: string[] }> = [
  { kind: 'Deployment', clusterScoped: false, namespaces: [] },
  { kind: 'StatefulSet', clusterScoped: false, namespaces: [] },
  { kind: 'Pod', clusterScoped: false, namespaces: [] },
]
