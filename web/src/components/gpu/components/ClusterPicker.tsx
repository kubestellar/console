import { useTranslation } from 'react-i18next'
import { Select } from '../../ui/Select'
import type { GPUClusterInfo } from '../ReservationFormModal'

interface ClusterPickerProps {
  selectedCluster: string | null
  onClusterChange: (cluster: string) => void
  clusters: GPUClusterInfo[]
}

export function ClusterPicker({
  selectedCluster,
  onClusterChange,
  clusters,
}: ClusterPickerProps) {
  const { t } = useTranslation(['cards'])

  return (
    <div>
      <label className="block text-sm font-medium text-foreground mb-2">
        {t('gpuReservations.form.cluster')}
      </label>
      <Select value={selectedCluster || ''} onValueChange={onClusterChange}>
        <option value="">-- Select Cluster --</option>
        {clusters.map((cluster) => (
          <option key={cluster.name} value={cluster.name}>
            {cluster.name} ({cluster.availableGPUs}/{cluster.totalGPUs} available)
          </option>
        ))}
      </Select>
    </div>
  )
}
