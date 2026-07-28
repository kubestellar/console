import { useTranslation } from 'react-i18next'
import { Check, Globe } from 'lucide-react'
import { cn } from '../../../lib/cn'

interface DistributionFilterSectionProps {
  availableDistributions: string[]
  selectedDistributions: string[]
  isAllDistributionsSelected: boolean
  selectAllDistributions: () => void
  deselectAllDistributions: () => void
  toggleDistribution: (distribution: string) => void
}

export function DistributionFilterSection({
  availableDistributions,
  selectedDistributions,
  isAllDistributionsSelected,
  selectAllDistributions,
  deselectAllDistributions,
  toggleDistribution,
}: DistributionFilterSectionProps) {
  const { t } = useTranslation()

  if (availableDistributions.length === 0) return null

  return (
    <div className="p-3 border-b border-border">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-medium text-foreground">{t('common:filters.distribution', 'Distribution')}</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={selectAllDistributions}
            className="text-xs text-purple-400 hover:text-purple-300"
            aria-label={t('common:filters.selectAllInSection', { defaultValue: 'Select all distributions' })}
          >
            {t('common.all')}
          </button>
          <button
            onClick={deselectAllDistributions}
            className="text-xs text-muted-foreground hover:text-foreground"
            aria-label={t('common:filters.clearSection', { defaultValue: 'Clear distributions' })}
          >
            {t('common.none')}
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {availableDistributions.map((dist) => {
          const isSelected = isAllDistributionsSelected || selectedDistributions.includes(dist)
          return (
            <button
              key={dist}
              onClick={() => toggleDistribution(dist)}
              aria-pressed={isSelected}
              className={cn(
                'flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-colors capitalize',
                isSelected
                  ? 'bg-blue-500/20 text-blue-400'
                  : 'bg-secondary/50 text-muted-foreground hover:text-foreground'
              )}
            >
              {isSelected && <Check className="w-3 h-3" />}
              {dist}
            </button>
          )
        })}
      </div>
    </div>
  )
}
