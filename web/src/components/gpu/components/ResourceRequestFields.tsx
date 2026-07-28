import { useTranslation } from 'react-i18next'
import { Zap } from 'lucide-react'
import { cn } from '../../../lib/cn'

type TranslateFn = (key: string, options?: string | Record<string, unknown>) => string

interface GPUTypeInfo {
  type: string
  total: number
  available: number
}

interface GPUTypeSelectorProps {
  clusterGPUTypes: GPUTypeInfo[]
  gpuPreferences: string[]
  onToggleType: (type: string) => void
}

export function GPUTypeSelector({ clusterGPUTypes, gpuPreferences, onToggleType }: GPUTypeSelectorProps) {
  const { t: tTyped } = useTranslation(['cards', 'common'])
  const t = tTyped as unknown as TranslateFn

  if (clusterGPUTypes.length <= 1) {
    // Single GPU type — show as info
    if (clusterGPUTypes.length === 1) {
      return (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Zap className="w-3.5 h-3.5 text-purple-400" />
          {clusterGPUTypes[0].type}
          <span className="text-xs">{t('gpuReservations.form.fields.singleGpuType', { available: clusterGPUTypes[0].available, total: clusterGPUTypes[0].total })}</span>
        </div>
      )
    }
    return null
  }

  return (
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
              onClick={() => onToggleType(gt.type)}
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
  )
}

interface ResourceRequestFieldsProps {
  gpuCount: string
  onGpuCountChange: (value: string) => void
  maxGPUs: number
  selectedClusterAvailableGPUs?: number
  clusterGPUTypes: GPUTypeInfo[]
  gpuPreferences: string[]
  onToggleGpuType: (type: string) => void
}

export function ResourceRequestFields({
  gpuCount,
  onGpuCountChange,
  maxGPUs,
  selectedClusterAvailableGPUs,
  clusterGPUTypes,
  gpuPreferences,
  onToggleGpuType,
}: ResourceRequestFieldsProps) {
  const { t: tTyped } = useTranslation(['cards', 'common'])
  const t = tTyped as unknown as TranslateFn

  return (
    <>
      {/* GPU Count */}
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
          onChange={e => onGpuCountChange(e.target.value)}
          min="1"
          max={maxGPUs || undefined}
          placeholder={t('gpuReservations.form.fields.gpuCountPlaceholder')}
          className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground"
        />
      </div>

      {/* GPU Type Selection */}
      <GPUTypeSelector
        clusterGPUTypes={clusterGPUTypes}
        gpuPreferences={gpuPreferences}
        onToggleType={onToggleGpuType}
      />
    </>
  )
}
