import { Zap, Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { COMMON_RESOURCE_TYPES } from '../../../hooks/useMCP'
import { cn } from '../../../lib/cn'

const GPU_KEYS = ['nvidia.com/gpu', 'amd.com/gpu', 'gpu.intel.com/i915']

interface GPUTypeOption {
  type: string
  available: number
  total: number
}

interface ResourceRequestFieldsProps {
  gpuCount: string
  onGpuCountChange: (value: string) => void
  gpuPreferences: string[]
  onGpuPreferencesChange: (types: string[]) => void
  clusterGPUTypes: GPUTypeOption[]
  maxGPUs: number
  selectedClusterInfo: { availableGPUs: number } | undefined
  enforceQuota: boolean
  extraResources: Array<{ key: string; value: string }>
  onExtraResourcesChange: (resources: Array<{ key: string; value: string }>) => void
}

export function ResourceRequestFields({
  gpuCount,
  onGpuCountChange,
  gpuPreferences,
  onGpuPreferencesChange,
  clusterGPUTypes,
  maxGPUs,
  selectedClusterInfo,
  enforceQuota,
  extraResources,
  onExtraResourcesChange,
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
        <input
          type="number"
          value={gpuCount}
          onChange={e => onGpuCountChange(e.target.value)}
          min="1"
          max={maxGPUs || undefined}
          placeholder={t('gpuReservations.form.fields.gpuCountPlaceholder')}
          className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground"
        />
      </div>

      {/* GPU Type Selection — multi-select */}
      {clusterGPUTypes.length > 1 && (
        <div>
          <label className="block text-sm font-medium text-muted-foreground mb-2">
            {t('gpuReservations.form.fields.gpuTypeLabel')}
          </label>
          <div className="flex flex-wrap gap-2">
            {clusterGPUTypes.map(gt => {
              const isSelected = gpuPreferences.includes(gt.type)
              return (
                <button
                  key={gt.type}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => {
                    onGpuPreferencesChange(
                      gpuPreferences.includes(gt.type)
                        ? gpuPreferences.filter(t => t !== gt.type)
                        : [...gpuPreferences, gt.type],
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
                  <span className="text-xs opacity-70">
                    {t('gpuReservations.form.fields.gpuTypeAvailability', { available: gt.available, total: gt.total })}
                  </span>
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

      {/* Single GPU type — show as info */}
      {clusterGPUTypes.length === 1 && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Zap className="w-3.5 h-3.5 text-purple-400" />
          {clusterGPUTypes[0].type}
          <span className="text-xs">
            {t('gpuReservations.form.fields.singleGpuType', {
              available: clusterGPUTypes[0].available,
              total: clusterGPUTypes[0].total,
            })}
          </span>
        </div>
      )}

      {/* Additional Resource Limits */}
      {enforceQuota && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-muted-foreground">
              {t('gpuReservations.form.fields.additionalLimits')}
            </label>
            <button
              onClick={() => onExtraResourcesChange([...extraResources, { key: '', value: '' }])}
              className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-blue-500/20 text-blue-400 hover:bg-blue-500/30"
            >
              <Plus className="w-3 h-3" /> {t('gpuReservations.form.fields.add')}
            </button>
          </div>
          {extraResources.map((r, i) => (
            <div key={i} className="flex items-center gap-2 mb-2">
              <select
                value={r.key}
                onChange={e => {
                  const updated = [...extraResources]
                  updated[i].key = e.target.value
                  onExtraResourcesChange(updated)
                }}
                className="flex-1 px-2 py-1.5 rounded bg-secondary border border-border text-sm text-foreground"
              >
                <option value="">{t('gpuReservations.form.fields.selectResource')}</option>
                {COMMON_RESOURCE_TYPES.filter(rt => !GPU_KEYS.some(gk => rt.key.includes(gk))).map(rt => (
                  <option key={rt.key} value={rt.key}>
                    {rt.label}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={r.value}
                onChange={e => {
                  const updated = [...extraResources]
                  updated[i].value = e.target.value
                  onExtraResourcesChange(updated)
                }}
                placeholder={t('gpuReservations.form.fields.resourcePlaceholder')}
                className="w-24 px-2 py-1.5 rounded bg-secondary border border-border text-sm text-foreground"
              />
              <button
                onClick={() => onExtraResourcesChange(extraResources.filter((_, j) => j !== i))}
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
