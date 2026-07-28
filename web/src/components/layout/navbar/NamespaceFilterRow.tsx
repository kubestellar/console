import { useTranslation } from 'react-i18next'
import { Search, X } from 'lucide-react'
import { Input } from '../../ui/Input'

interface NamespaceFilterRowProps {
  inputId: string
  customFilter: string
  setCustomFilter: (value: string) => void
  hasCustomFilter: boolean
  clearCustomFilter: () => void
}

export function NamespaceFilterRow({
  inputId,
  customFilter,
  setCustomFilter,
  hasCustomFilter,
  clearCustomFilter,
}: NamespaceFilterRowProps) {
  const { t } = useTranslation()

  return (
    <div className="p-3 border-b border-border">
      <div className="flex items-center gap-2 mb-2">
        <Search className="w-4 h-4 text-purple-400" />
        <span className="text-sm font-medium text-foreground">{t('common:filters.customFilter', 'Custom Filter')}</span>
      </div>
      <div className="flex gap-2">
        <Input
          id={inputId}
          type="text"
          value={customFilter}
          onChange={(e) => setCustomFilter(e.target.value)}
          placeholder={t('common:filters.customFilterPlaceholder', 'Filter by name, namespace...')}
          className="flex-1 bg-secondary/50"
        />
        {hasCustomFilter && (
          <button
            onClick={clearCustomFilter}
            className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
            aria-label={t('common:filters.clearCustomFilter', 'Clear custom filter')}
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  )
}
