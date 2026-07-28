import { RESULT_TYPE_CHIP_CLASS } from './searchResultStyles'
import type { SearchItem } from '../../../hooks/useSearchIndex'

interface SearchResultsGroupProps {
  categoryLabel: string
  CategoryIcon: React.ComponentType<{ className?: string }>
  items: SearchItem[]
  startIndex: number
  selectedIndex: number
  onSelect: (item: SearchItem, index: number) => void
}

export function SearchResultsGroup({
  categoryLabel,
  CategoryIcon,
  items,
  startIndex,
  selectedIndex,
  onSelect,
}: SearchResultsGroupProps) {
  return (
    <div>
      <div className="flex items-center gap-2 px-3 pt-2.5 pb-1">
        <CategoryIcon className="w-3.5 h-3.5 text-muted-foreground/60" />
        <span className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wider">
          {categoryLabel}
        </span>
      </div>
      {items.map((item, offset) => {
        const currentIndex = startIndex + offset
        const isSelected = currentIndex === selectedIndex
        return (
          <button
            key={item.id}
            data-testid="global-search-result-item"
            data-selected={isSelected}
            onClick={() => onSelect(item, currentIndex)}
            className={`w-full flex items-center gap-3 px-4 py-1.5 text-left transition-colors ${
              isSelected
                ? 'bg-purple-900 text-foreground'
                : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
            }`}
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{item.name}</p>
              {item.description && (
                <p className="text-xs text-muted-foreground truncate">{item.description}</p>
              )}
            </div>
            <span className={RESULT_TYPE_CHIP_CLASS}>{categoryLabel.toLowerCase()}</span>
          </button>
        )
      })}
    </div>
  )
}
