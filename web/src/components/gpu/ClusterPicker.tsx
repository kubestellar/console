import { Loader2 } from 'lucide-react'
import type { GPUClusterInfo } from './ReservationFormModal'

type TranslateFn = (key: string, options?: string | Record<string, unknown>) => string

interface NsField {
  value: string
  isNew: boolean
}

interface ClusterPickerProps {
  t: TranslateFn
  cluster: string
  setCluster: (cluster: string) => void
  namespace: string
  isNewNamespace: boolean
  setNsField: (updater: NsField | ((prev: NsField) => NsField)) => void
  setGpuPreferences: (prefs: string[]) => void
  gpuClusters: GPUClusterInfo[]
  clusterNamespaces: string[]
  editingReservation: unknown
  namespacesLoading: boolean
  namespacesError: string | null
  refetchNamespaces: () => void
}

/**
 * Cluster and namespace selection fields for the reservation form.
 * Extracted from ReservationFormModal.tsx (#21613) to reduce the parent
 * component's line count.
 */
export function ClusterPicker({
  t,
  cluster,
  setCluster,
  namespace,
  isNewNamespace,
  setNsField,
  setGpuPreferences,
  gpuClusters,
  clusterNamespaces,
  editingReservation,
  namespacesLoading,
  namespacesError,
  refetchNamespaces,
}: ClusterPickerProps) {
  return (
    <>
      {/* Cluster (GPU-only, with counts) */}
      <div>
        <label className="block text-sm font-medium text-muted-foreground mb-1">{t('gpuReservations.form.fields.clusterLabel')}</label>
        <select value={cluster} onChange={e => { setCluster(e.target.value); setNsField({ value: '', isNew: false }); setGpuPreferences([]) }}
          disabled={!!editingReservation}
          className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground disabled:opacity-50">
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

      {/* Namespace */}
      <div>
        <label className="block text-sm font-medium text-muted-foreground mb-1">{t('gpuReservations.form.fields.namespaceLabel')}</label>
        {!isNewNamespace ? (
          <select
            value={namespace}
            onChange={e => {
              if (e.target.value === '__new__' || e.target.value === '__new_bottom__') {
                setNsField({ value: '', isNew: true })
                setTimeout(() => document.getElementById('new-ns-input')?.focus(), 0)
              } else {
                setNsField(prev => ({ ...prev, value: e.target.value }))
              }
            }}
            disabled={!!editingReservation || !cluster || (namespacesLoading && clusterNamespaces.length === 0)}
            className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground disabled:opacity-50"
          >
            <option value="">{t('gpuReservations.form.fields.selectNamespace')}</option>
            <option value="__new__">{t('gpuReservations.form.fields.newNamespace')}</option>
            {clusterNamespaces.map(ns => (
              <option key={ns} value={ns}>{ns}</option>
            ))}
            {clusterNamespaces.length > 0 && (
              <option value="__new_bottom__">{t('gpuReservations.form.fields.newNamespace')}</option>
            )}
          </select>
        ) : (
          <div className="flex gap-2">
            <input
              id="new-ns-input"
              type="text"
              value={namespace}
              onChange={e => setNsField(prev => ({ ...prev, value: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))}
              placeholder={t('gpuReservations.form.fields.enterNamespace')}
              disabled={!!editingReservation}
              className="flex-1 px-3 py-2 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground disabled:opacity-50"
              autoFocus
            />
            <button
              type="button"
              onClick={() => setNsField({ value: '', isNew: false })}
              className="px-3 py-2 rounded-lg bg-secondary border border-border text-muted-foreground hover:text-foreground"
              title={t('gpuReservations.form.fields.backToList')}
              aria-label={t('gpuReservations.form.fields.backToList')}
            >
              &times;
            </button>
          </div>
        )}
        {cluster && !isNewNamespace && namespacesLoading && (
          <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>{t('common:status.loadingNamespaces')}</span>
          </div>
        )}
        {cluster && !isNewNamespace && namespacesError && !namespacesLoading && (
          <div className="mt-2 flex items-center gap-2 text-xs text-red-400">
            <span>{namespacesError}</span>
            <button
              type="button"
              onClick={() => void refetchNamespaces()}
              className="font-medium underline underline-offset-2 hover:text-red-300"
            >
              Retry
            </button>
          </div>
        )}
      </div>
    </>
  )
}
