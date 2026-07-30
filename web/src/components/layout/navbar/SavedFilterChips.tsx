import { useTranslation } from 'react-i18next'
import { Check, Save, Trash2 } from 'lucide-react'
import { cn } from '../../../lib/cn'
import type { SavedFilterSet } from '../../../hooks/useGlobalFilters'

interface SavedFilterChipsProps {
  savedFilterSets: SavedFilterSet[]
  activeFilterSetId: string | null
  applySavedFilterSet: (id: string) => void
  deleteSavedFilterSet: (id: string) => void
}

export function SavedFilterChips({
  savedFilterSets,
  activeFilterSetId,
  applySavedFilterSet,
  deleteSavedFilterSet,
}: SavedFilterChipsProps) {
  const { t } = useTranslation()

  if (savedFilterSets.length === 0) return null

  return (
    <div className="p-3 border-b border-border">
      <div className="flex items-center gap-2 mb-2">
        <Save className="w-4 h-4 text-purple-400" />
        <span className="text-sm font-medium text-foreground">
          {t('common:filters.savedFilters', 'Saved Filters')}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {savedFilterSets.map(fs => {
          const isActive = activeFilterSetId === fs.id
          return (
            <div key={fs.id} className="flex items-center group/fs">
              <button
                onClick={() => applySavedFilterSet(fs.id)}
                aria-pressed={isActive}
                aria-label={t('common:filters.applyFilterSet', { defaultValue: `Apply filter set ${fs.name}`, name: fs.name })}
                className={cn(
                  'flex items-center gap-1.5 px-2 py-1 rounded-l text-xs font-medium transition-colors',
                  isActive
                    ? 'bg-purple-500/20 text-purple-400'
                    : 'bg-secondary/50 text-muted-foreground hover:text-foreground',
                )}
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: fs.color }}
                />
                <span className="max-w-[100px] truncate">{fs.name}</span>
                {isActive && <Check className="w-3 h-3" />}
              </button>
              <button
                onClick={() => deleteSavedFilterSet(fs.id)}
                aria-label={t('common:filters.deleteFilter', { defaultValue: `Delete filter set ${fs.name}`, name: fs.name })}
                className={cn(
                  'flex items-center justify-center px-1 py-1 rounded-r text-muted-foreground transition-all',
                  isActive
                    ? 'bg-purple-500/20 hover:text-red-400'
                    : 'bg-secondary/50 opacity-0 group-hover/fs:opacity-100 hover:text-red-400',
                )}
                title={t('common:filters.deleteFilter', 'Delete filter set')}
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
