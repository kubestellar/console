import { Zap, Plus, Trash2, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { COMMON_RESOURCE_TYPES } from '../../hooks/useMCP'
import type { GPUNode } from '../../hooks/useMCP'
import { cn } from '../../lib/cn'
import { GPU_KEYS, type GPUClusterInfo } from './ReservationFormModal.utils'

interface ClusterPickerProps {
  cluster: string
  setCluster: (v: string) => void
  gpuClusters: GPUClusterInfo[]
  editingReservationCluster?: string
  onClusterChange: (cluster: string) => void
}

export function ClusterPicker({ cluster, gpuClusters, editingReservationCluster, onClusterChange }: ClusterPickerProps) {
  const { t } = useTranslation(['cards', 'common'])
  return (
    <div>
      <label className="block text-sm font-medium text-muted-foreground mb-1">{t('gpuReservations.form.fields.clusterLabel')}</label>
      <select
        value={cluster}
        onChange={e => onClusterChange(e.target.value)}
        disabled={!!editingReservationCluster}
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

interface NamespaceFieldProps {
  namespace: string
  isNewNamespace: boolean
  cluster: string
  editingReservationNs?: string
  clusterNamespaces: string[]
  namespacesLoading: boolean
  namespacesError: string | null
  onNamespaceChange: (value: string) => void
  onToggleNew: (isNew: boolean) => void
  onRetry: () => void
}

export function NamespaceField({
  namespace, isNewNamespace, cluster, editingReservationNs,
  clusterNamespaces, namespacesLoading, namespacesError,
  onNamespaceChange, onToggleNew, onRetry,
}: NamespaceFieldProps) {
  const { t } = useTranslation(['cards', 'common'])
  return (
    <div>
      <label className="block text-sm font-medium text-muted-foreground mb-1">{t('gpuReservations.form.fields.namespaceLabel')}</label>
      {!isNewNamespace ? (
        <select
          value={namespace}
          onChange={e => {
            if (e.target.value === '__new__' || e.target.value === '__new_bottom__') {
              onToggleNew(true)
              setTimeout(() => document.getElementById('new-ns-input')?.focus(), 0)
            } else {
              onNamespaceChange(e.target.value)
            }
          }}
          disabled={!!editingReservationNs || !cluster || (namespacesLoading && clusterNamespaces.length === 0)}
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
            onChange={e => onNamespaceChange(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
            placeholder={t('gpuReservations.form.fields.enterNamespace')}
            disabled={!!editingReservationNs}
            className="flex-1 px-3 py-2 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground disabled:opacity-50"
            autoFocus
          />
          <button
            type="button"
            onClick={() => onToggleNew(false)}
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
            onClick={onRetry}
            className="font-medium underline underline-offset-2 hover:text-red-300"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  )
}

interface ResourceRequestFieldsProps {
  gpuCount: string
  setGpuCount: (v: string) => void
  gpuPreferences: string[]
  setGpuPreferences: React.Dispatch<React.SetStateAction<string[]>>
  clusterGPUTypes: Array<{ type: string; total: number; available: number }>
  selectedClusterInfo?: GPUClusterInfo
  maxGPUs: number
  extraResources: Array<{ key: string; value: string }>
  setExtraResources: React.Dispatch<React.SetStateAction<Array<{ key: string; value: string }>>>
  enforceQuota: boolean
  notes: string
  setNotes: (v: string) => void
}

export function ResourceRequestFields({
  gpuCount, setGpuCount, gpuPreferences, setGpuPreferences,
  clusterGPUTypes, selectedClusterInfo, maxGPUs,
  extraResources, setExtraResources, enforceQuota,
  notes, setNotes,
}: ResourceRequestFieldsProps) {
  const { t } = useTranslation(['cards', 'common'])
  return (
    <>
      {/* GPU Count */}
      <div>
        <label className="block text-sm font-medium text-muted-foreground mb-1">
          {t('gpuReservations.form.fields.gpuCountLabel')}
          {selectedClusterInfo && (
            <span className="text-xs text-green-400 ml-2">
              {t('gpuReservations.form.fields.maxAvailable', { count: selectedClusterInfo.availableGPUs })}
            </span>
          )}
        </label>
        <input type="number" value={gpuCount} onChange={e => setGpuCount(e.target.value)}
          min="1" max={maxGPUs || undefined}
          placeholder={t('gpuReservations.form.fields.gpuCountPlaceholder')}
          className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground" />
      </div>

      {/* GPU Type — multi-select */}
      {clusterGPUTypes.length > 1 && (
        <div>
          <label className="block text-sm font-medium text-muted-foreground mb-2">{t('gpuReservations.form.fields.gpuTypeLabel')}</label>
          <div className="flex flex-wrap gap-2">
            {clusterGPUTypes.map(gt => {
              const isSelected = gpuPreferences.includes(gt.type)
              return (
                <button
                  key={gt.type}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => {
                    setGpuPreferences(prev =>
                      prev.includes(gt.type) ? prev.filter(t => t !== gt.type) : [...prev, gt.type],
                    )
                  }}
                  className={cn(
                    'flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm transition-colors',
                    isSelected
                      ? 'border-purple-500 bg-purple-500/10 text-purple-400'
                      : 'border-border bg-secondary text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Zap className="w-3.5 h-3.5" />
                  {gt.type}
                  <span className="text-xs opacity-70">{t('gpuReservations.form.fields.gpuTypeAvailability', { available: gt.available, total: gt.total })}</span>
                </button>
              )
            })}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {gpuPreferences.length === 0
              ? 'No type selected — any GPU will be accepted.'
              : gpuPreferences.length === 1
              ? '1 type accepted'
              : `${gpuPreferences.length} types accepted`}
          </div>
        </div>
      )}
      {clusterGPUTypes.length === 1 && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Zap className="w-3.5 h-3.5 text-purple-400" />
          {clusterGPUTypes[0].type}
          <span className="text-xs">{t('gpuReservations.form.fields.singleGpuType', { available: clusterGPUTypes[0].available, total: clusterGPUTypes[0].total })}</span>
        </div>
      )}

      {/* Additional Resource Limits */}
      {enforceQuota && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-muted-foreground">{t('gpuReservations.form.fields.additionalLimits')}</label>
            <button onClick={() => setExtraResources([...extraResources, { key: '', value: '' }])}
              className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-blue-500/20 text-blue-400 hover:bg-blue-500/30">
              <Plus className="w-3 h-3" /> {t('gpuReservations.form.fields.add')}
            </button>
          </div>
          {extraResources.map((r, i) => (
            <div key={i} className="flex items-center gap-2 mb-2">
              <select value={r.key} onChange={e => {
                const updated = [...extraResources]; updated[i].key = e.target.value; setExtraResources(updated)
              }} className="flex-1 px-2 py-1.5 rounded bg-secondary border border-border text-sm text-foreground">
                <option value="">{t('gpuReservations.form.fields.selectResource')}</option>
                {COMMON_RESOURCE_TYPES.filter(rt => !GPU_KEYS.some(gk => rt.key.includes(gk))).map(rt => (
                  <option key={rt.key} value={rt.key}>{rt.label}</option>
                ))}
              </select>
              <input type="text" value={r.value} onChange={e => {
                const updated = [...extraResources]; updated[i].value = e.target.value; setExtraResources(updated)
              }} placeholder={t('gpuReservations.form.fields.resourcePlaceholder')} className="w-24 px-2 py-1.5 rounded bg-secondary border border-border text-sm text-foreground" />
              <button onClick={() => setExtraResources(extraResources.filter((_, j) => j !== i))}
                className="p-1 hover:bg-secondary rounded text-muted-foreground hover:text-red-400"
                aria-label="Remove resource limit">
                <Trash2 className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Notes */}
      <div>
        <label className="block text-sm font-medium text-muted-foreground mb-1">{t('gpuReservations.form.fields.notesLabel')}</label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
          placeholder={t('gpuReservations.form.fields.notesPlaceholder')}
          className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground" />
      </div>
    </>
  )
}

interface ScheduleSelectorProps {
  startDate: string
  setStartDate: (v: string) => void
  durationHours: string
  setDurationHours: (v: string) => void
}

export function ScheduleSelector({ startDate, setStartDate, durationHours, setDurationHours }: ScheduleSelectorProps) {
  const { t } = useTranslation(['cards', 'common'])
  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <label className="block text-sm font-medium text-muted-foreground mb-1">{t('gpuReservations.form.fields.startDateLabel')}</label>
        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
          className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground" />
      </div>
      <div>
        <label className="block text-sm font-medium text-muted-foreground mb-1">{t('gpuReservations.form.fields.durationLabel')}</label>
        <input type="number" value={durationHours} onChange={e => setDurationHours(e.target.value)}
          min="1" placeholder={t('gpuReservations.form.fields.durationPlaceholder')}
          className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground" />
      </div>
    </div>
  )
}
