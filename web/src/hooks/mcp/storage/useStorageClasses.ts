import { useClusterResourceQuery } from '../useClusterResourceQuery'
import type { StorageClass } from '../types'

export function useStorageClasses(cluster?: string) {
  const result = useClusterResourceQuery<StorageClass>({
    resourceKey: 'storageClasses',
    endpoint: 'storageclasses',
    dataField: 'storageClasses',
    getDemoData: getDemoStorageClasses,
    filterFn: (item, selectedCluster) => !selectedCluster || item.cluster === selectedCluster,
    cluster,
    silentErrors: true,
  })

  return {
    storageClasses: result.data,
    isLoading: result.isLoading,
    error: result.error,
    refetch: result.refetch,
    isDemoFallback: result.isDemoFallback,
  }
}

export function getDemoStorageClasses(): StorageClass[] {
  return [
    { name: 'gp3', cluster: 'prod-east', provisioner: 'ebs.csi.aws.com', reclaimPolicy: 'Delete', volumeBindingMode: 'WaitForFirstConsumer', isDefault: true, age: '120d' },
    { name: 'standard', cluster: 'staging', provisioner: 'kubernetes.io/gce-pd', reclaimPolicy: 'Delete', volumeBindingMode: 'Immediate', isDefault: true, age: '200d' },
    { name: 'fast-ssd', cluster: 'vllm-d', provisioner: 'disk.csi.azure.com', reclaimPolicy: 'Delete', volumeBindingMode: 'WaitForFirstConsumer', age: '45d' },
    { name: 'cold-storage', cluster: 'prod-east', provisioner: 'efs.csi.aws.com', reclaimPolicy: 'Retain', volumeBindingMode: 'Immediate', age: '90d' },
  ]
}
