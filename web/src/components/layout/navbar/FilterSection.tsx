import { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Check } from 'lucide-react'
import { cn } from '../../../lib/cn'

interface FilterSectionConfig {
  label: string
  color: string
  bgColor: string
}

interface FilterSectionProps<T extends string> {
  icon: ReactNode
  title: string
  levels: T[]
  configMap: Record<T, FilterSectionConfig>
  selectedItems: T[]
  isAllSelected: boolean
  onToggle: (item: T) => void
  onSelectAll: () => void
  onDeselectAll: () => void
}

export function FilterSection<T extends string>({
  icon,
  title,
  levels,
  configMap,
  selectedItems,
  isAllSelected,
  onToggle,
  onSelectAll,
  onDeselectAll,
}: FilterSectionProps<T>) {
  const { t } = useTranslation()

  return (
    <div className="p-3 border-b border-border">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-sm font-medium text-foreground">{title}</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onSelectAll}
            className="text-xs text-purple-400 hover:text-purple-300"
            aria-label={t('common:filters.selectAllInSection', { defaultValue: `Select all ${title}` })}
          >
            {t('common.all')}
          </button>
          <button
            onClick={onDeselectAll}
            className="text-xs text-muted-foreground hover:text-foreground"
            aria-label={t('common:filters.clearSection', { defaultValue: `Clear ${title}` })}
          >
            {t('common.none')}
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {levels.map((item) => {
          const config = configMap[item]
          const isSelected = isAllSelected || selectedItems.includes(item)
          return (
            <button
              key={item}
              onClick={() => onToggle(item)}
              aria-pressed={isSelected}
              className={cn(
                'flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-colors',
                isSelected
                  ? `${config.bgColor} ${config.color}`
                  : 'bg-secondary/50 text-muted-foreground hover:text-foreground'
              )}
            >
              {isSelected && <Check className="w-3 h-3" />}
              {config.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
