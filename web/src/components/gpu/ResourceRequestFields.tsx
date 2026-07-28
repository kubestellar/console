import { Loader2, Plus, Trash2, Zap } from 'lucide-react'
import type { Dispatch, SetStateAction } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'
import type {
  ClusterGPUTypeAvailability,
  ExtraResourceLimit,
  NamespaceFieldState,
} from './ReservationFormModal.types'

interface ResourceRequestFieldsProps {
  editingReservation: boolean
  cluster: string
  namespace: string
  isNewNamespace: boolean
  clusterNamespaces: string[]
  namespacesLoading: boolean
  namespacesError: string | null
  refetchNamespaces: () => Promise<void>
  gpuCount: string
  maxGPUs: number
  selectedClusterAvailableGPUs?: number
  clusterGPUTypes: ClusterGPUTypeAvailability[]
  gpuPreferences: string[]
  enforceQuota: boolean
  extraResources: ExtraResourceLimit[]
  additionalResourceTypes: Array<{ key: string; label: string }>
  setNsField: Dispatch<SetStateAction<NamespaceFieldState>>
  setGpuCount: Dispatch<SetStateAction<string>>
  setGpuPreferences: Dispatch<SetStateAction<string[]>>
  setExtraResources: Dispatch<SetStateAction<ExtraResourceLimit[]>>
}

export function ResourceRequestFields({
  editingReservation,
  cluster,
  namespace,
  isNewNamespace,
  clusterNamespaces,
  namespacesLoading,
  namespacesError,
  refetchNamespaces,
  gpuCount,
  maxGPUs,
  selectedClusterAvailableGPUs,
  clusterGPUTypes,
  gpuPreferences,
  enforceQuota,
  extraResources,
  additionalResourceTypes,
  setNsField,
  setGpuCount,
  setGpuPreferences,
  setExtraResources,
}: ResourceRequestFieldsProps) {
  const { t } = useTranslation(['cards', 'common'])

  return (
    <>
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
            disabled={editingReservation || !cluster || (namespacesLoading && clusterNamespaces.length === 0)}
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
              disabled={editingReservation}
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

      <div>
        <label className="block text-sm font-medium text-muted-foreground mb-1">
          {t('gpuReservations.form.fields.gpuCountLabel')}
          {selectedClusterAvailableGPUs !== undefined && (
            <span className="text-xs text-green-400 ml-2">
              {t('gpuReservations.form.fields.maxAvailable', { count: selectedClusterAvailableGPUs })}
            </span>
          )}
        </label>
        <input
          type="number"
          value={gpuCount}
          onChange={e => setGpuCount(e.target.value)}
          min="1"
          max={maxGPUs || undefined}
          placeholder={t('gpuReservations.form.fields.gpuCountPlaceholder')}
          className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground"
        />
      </div>

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
                      prev.includes(gt.type) ? prev.filter(type => type !== gt.type) : [...prev, gt.type],
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

      {enforceQuota && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-muted-foreground">{t('gpuReservations.form.fields.additionalLimits')}</label>
            <button
              onClick={() => setExtraResources([...extraResources, { key: '', value: '' }])}
              className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-blue-500/20 text-blue-400 hover:bg-blue-500/30"
            >
              <Plus className="w-3 h-3" /> {t('gpuReservations.form.fields.add')}
            </button>
          </div>
          {extraResources.map((resource, index) => (
            <div key={index} className="flex items-center gap-2 mb-2">
              <select
                value={resource.key}
                onChange={e => {
                  const updated = [...extraResources]
                  updated[index].key = e.target.value
                  setExtraResources(updated)
                }}
                className="flex-1 px-2 py-1.5 rounded bg-secondary border border-border text-sm text-foreground"
              >
                <option value="">{t('gpuReservations.form.fields.selectResource')}</option>
                {additionalResourceTypes.map(resourceType => (
                  <option key={resourceType.key} value={resourceType.key}>{resourceType.label}</option>
                ))}
              </select>
              <input
                type="text"
                value={resource.value}
                onChange={e => {
                  const updated = [...extraResources]
                  updated[index].value = e.target.value
                  setExtraResources(updated)
                }}
                placeholder={t('gpuReservations.form.fields.resourcePlaceholder')}
                className="w-24 px-2 py-1.5 rounded bg-secondary border border-border text-sm text-foreground"
              />
              <button
                onClick={() => setExtraResources(extraResources.filter((_, itemIndex) => itemIndex !== index))}
                className="p-1 hover:bg-secondary rounded text-muted-foreground hover:text-red-400"
                aria-label="Remove resource limit"
              >
                <Trash2 className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
