import { useTranslation } from 'react-i18next'
import type { GPUClusterInfo } from './ReservationFormModal.types'

interface ClusterPickerProps {
  cluster: string
  gpuClusters: GPUClusterInfo[]
  disabled: boolean
  onChange: (cluster: string) => void
}

export function ClusterPicker({ cluster, gpuClusters, disabled, onChange }: ClusterPickerProps) {
  const { t } = useTranslation(['cards', 'common'])

  return (
    <div>
      <label className="block text-sm font-medium text-muted-foreground mb-1">{t('gpuReservations.form.fields.clusterLabel')}</label>
      <select
        value={cluster}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground disabled:opacity-50"
      >
        <option value="">{t('gpuReservations.form.fields.selectCluster')}</option>
        {gpuClusters.map(c => (
          <option key={c.name} value={c.name}>
            {t('gpuReservations.form.fields.clusterOption', { name: c.name, available: c.availableGPUs, total: c.totalGPUs })}
          </option>
        ))}
      </select>
      {gpuClusters.length === 0 && (
        <div className="text-xs text-yellow-400 mt-1">{t('gpuReservations.form.fields.noClustersWithGpus')}</div>
      )}
    </div>
  )
}
