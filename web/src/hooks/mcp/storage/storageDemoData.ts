/**
 * Demo data factories for storage hooks (PVCs, ResourceQuotas, LimitRanges).
 *
 * Split from storage.ts (Issue #23155).
 */
import type { PVC, ResourceQuota, LimitRange } from '../types'

export function getDemoPVCs(): PVC[] {
  return [
    { name: 'postgres-data', namespace: 'data', cluster: 'prod-east', status: 'Bound', storageClass: 'gp3', capacity: '100Gi', accessModes: ['ReadWriteOnce'], volumeName: 'pvc-abc123', age: '40d' },
    { name: 'redis-data', namespace: 'data', cluster: 'prod-east', status: 'Bound', storageClass: 'gp3', capacity: '20Gi', accessModes: ['ReadWriteOnce'], volumeName: 'pvc-def456', age: '40d' },
    { name: 'prometheus-data', namespace: 'monitoring', cluster: 'staging', status: 'Bound', storageClass: 'standard', capacity: '50Gi', accessModes: ['ReadWriteOnce'], volumeName: 'pvc-ghi789', age: '20d' },
    { name: 'grafana-data', namespace: 'monitoring', cluster: 'staging', status: 'Bound', storageClass: 'standard', capacity: '10Gi', accessModes: ['ReadWriteOnce'], volumeName: 'pvc-jkl012', age: '20d' },
    { name: 'model-cache', namespace: 'ml', cluster: 'vllm-d', status: 'Bound', storageClass: 'fast-ssd', capacity: '500Gi', accessModes: ['ReadWriteMany'], volumeName: 'pvc-mno345', age: '15d' },
    { name: 'training-data', namespace: 'ml', cluster: 'vllm-d', status: 'Pending', storageClass: 'fast-ssd', capacity: '1Ti', accessModes: ['ReadWriteMany'], age: '1d' },
    { name: 'logs-archive', namespace: 'logging', cluster: 'prod-east', status: 'Bound', storageClass: 'cold-storage', capacity: '200Gi', accessModes: ['ReadWriteOnce'], volumeName: 'pvc-pqr678', age: '60d' },
  ]
}

export function getDemoResourceQuotas(): ResourceQuota[] {
  return [
    {
      name: 'compute-quota',
      namespace: 'production',
      cluster: 'prod-east',
      hard: { 'requests.cpu': '10', 'requests.memory': '20Gi', 'limits.cpu': '20', 'limits.memory': '40Gi', pods: '50' },
      used: { 'requests.cpu': '5', 'requests.memory': '10Gi', 'limits.cpu': '8', 'limits.memory': '16Gi', pods: '25' },
      age: '30d'
    },
    {
      name: 'storage-quota',
      namespace: 'data',
      cluster: 'prod-east',
      hard: { 'requests.storage': '500Gi', persistentvolumeclaims: '10' },
      used: { 'requests.storage': '320Gi', persistentvolumeclaims: '5' },
      age: '40d'
    },
    {
      name: 'ml-quota',
      namespace: 'ml',
      cluster: 'vllm-d',
      hard: { 'requests.cpu': '100', 'requests.memory': '200Gi', 'limits.cpu': '200', 'limits.memory': '400Gi', 'requests.nvidia.com/gpu': '8', pods: '20' },
      used: { 'requests.cpu': '64', 'requests.memory': '128Gi', 'limits.cpu': '128', 'limits.memory': '256Gi', 'requests.nvidia.com/gpu': '4', pods: '8' },
      age: '15d'
    },
    {
      name: 'default-quota',
      namespace: 'default',
      cluster: 'staging',
      hard: { 'requests.cpu': '4', 'requests.memory': '8Gi', 'limits.cpu': '8', 'limits.memory': '16Gi', pods: '20' },
      used: { 'requests.cpu': '1', 'requests.memory': '2Gi', 'limits.cpu': '2', 'limits.memory': '4Gi', pods: '5' },
      age: '60d'
    },
  ]
}

export function getDemoLimitRanges(): LimitRange[] {
  return [
    {
      name: 'container-limits',
      namespace: 'production',
      cluster: 'prod-east',
      limits: [
        {
          type: 'Container',
          default: { cpu: '500m', memory: '512Mi' },
          defaultRequest: { cpu: '100m', memory: '128Mi' },
          max: { cpu: '2', memory: '4Gi' },
          min: { cpu: '50m', memory: '64Mi' }
        }
      ],
      age: '30d'
    },
    {
      name: 'pod-limits',
      namespace: 'ml',
      cluster: 'vllm-d',
      limits: [
        {
          type: 'Container',
          default: { cpu: '1', memory: '2Gi' },
          defaultRequest: { cpu: '500m', memory: '1Gi' },
          max: { cpu: '16', memory: '64Gi' },
          min: { cpu: '100m', memory: '256Mi' }
        },
        {
          type: 'Pod',
          max: { cpu: '32', memory: '128Gi' }
        }
      ],
      age: '15d'
    },
    {
      name: 'storage-limits',
      namespace: 'data',
      cluster: 'prod-east',
      limits: [
        {
          type: 'PersistentVolumeClaim',
          max: { storage: '100Gi' },
          min: { storage: '1Gi' }
        }
      ],
      age: '40d'
    },
  ]
}
