import { useMemo, useEffect } from 'react'
import {
  LayoutDashboard,
  LayoutGrid,
  BarChart3,
  Settings,
  Server,
  FolderOpen,
  Box,
  Container,
  Globe,
  Bot,
  Package,
  HardDrive } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useSearchIndex, CATEGORY_ORDER, type SearchCategory, type SearchItem } from '../../../hooks/useSearchIndex'

/** Result type chip styling — higher contrast and enough padding to read quickly. */
const RESULT_TYPE_CHIP_CLASS = 'inline-flex shrink-0 items-center rounded-full border border-border bg-secondary px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-foreground'

const CATEGORY_CONFIG: Record<SearchCategory, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  page: { label: 'Dashboards', icon: LayoutDashboard },
  card: { label: 'Cards', icon: LayoutGrid },
  stat: { label: 'Stats', icon: BarChart3 },
  setting: { label: 'Settings', icon: Settings },
  cluster: { label: 'Clusters', icon: Server },
  namespace: { label: 'Namespaces', icon: FolderOpen },
  deployment: { label: 'Deployments', icon: Box },
  pod: { label: 'Pods', icon: Container },
  service: { label: 'Services', icon: Globe },
  mission: { label: 'AI Missions', icon: Bot },
  dashboard: { label: 'Custom Dashboards', icon: LayoutDashboard },
  helm: { label: 'Helm Releases', icon: Package },
  node: { label: 'Nodes', icon: HardDrive } }

export function SearchResultsPanel({
  searchQuery,
  selectedIndex,
  onSelect,
  onAskAI,
  resultsRef,
  onResultsChange,
}: {
  searchQuery: string
  selectedIndex: number
  onSelect: (item: SearchItem, index: number) => void
  onAskAI: () => void
  resultsRef: React.RefObject<HTMLDivElement | null>
  onResultsChange: (flatResults: SearchItem[], totalCount: number) => void
}) {
  const { t } = useTranslation()
  const { results, totalCount } = useSearchIndex(searchQuery)

  const flatResults = useMemo(() => {
    const flat: SearchItem[] = []
    for (const cat of CATEGORY_ORDER) {
      const items = results.get(cat)
      if (items) flat.push(...items)
    }
    return flat
  }, [results])

  useEffect(() => {
    onResultsChange(flatResults, totalCount)
  }, [flatResults, totalCount, onResultsChange])

  const askAIIndex = flatResults.length

  let flatIndex = 0

  return (
    <div className="absolute top-full left-0 right-0 mt-2 bg-card border border-border rounded-lg shadow-xl overflow-hidden z-toast">
      {flatResults.length > 0 ? (
        <div ref={resultsRef} data-testid="global-search-results" className="py-1 max-h-96 overflow-y-auto">
          {CATEGORY_ORDER.map(cat => {
            const items = results.get(cat)
            if (!items || items.length === 0) return null
            const config = CATEGORY_CONFIG[cat]
            const CategoryIcon = config.icon

            return (
              <div key={cat}>
                <div className="flex items-center gap-2 px-3 pt-2.5 pb-1">
                  <CategoryIcon className="w-3.5 h-3.5 text-muted-foreground/60" />
                  <span className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wider">
                    {config.label}
                  </span>
                </div>
                {items.map(item => {
                  const currentIndex = flatIndex++
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
                      <span className={RESULT_TYPE_CHIP_CLASS}>
                        {config.label.toLowerCase()}
                      </span>
                    </button>
                  )
                })}
              </div>
            )
          })}
          {totalCount > flatResults.length && (
            <div className="px-4 py-2 text-xs text-muted-foreground/50 text-center border-t border-border/50">
              {t('layout.navbar.showingResults', { shown: flatResults.length, total: totalCount })}
            </div>
          )}

          <div className="border-t border-border/50">
            <button
              data-selected={selectedIndex === askAIIndex}
              onClick={onAskAI}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                selectedIndex === askAIIndex
                  ? 'bg-purple-900 text-foreground'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              }`}
            >
              <Bot className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{t('layout.navbar.askAIAboutThis')}</p>
                <p className="text-xs text-muted-foreground truncate">&quot;{searchQuery}&quot;</p>
              </div>
              <kbd className="text-2xs px-1.5 py-0.5 rounded bg-secondary text-muted-foreground/70 shrink-0">
                &crarr;
              </kbd>
            </button>
          </div>
        </div>
      ) : (
        <div className="py-4">
          <div className="px-4 py-2 text-center mb-2">
            <p className="text-muted-foreground text-sm">{t('layout.navbar.noResultsFor', { query: searchQuery })}</p>
          </div>
          <div className="border-t border-border/50">
            <button
              data-selected={selectedIndex === askAIIndex}
              onClick={onAskAI}
              className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                selectedIndex === askAIIndex
                  ? 'bg-purple-900 text-foreground'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              }`}
            >
              <Bot className="w-5 h-5 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{t('layout.navbar.askAIInstead')}</p>
                <p className="text-xs text-muted-foreground truncate">{t('layout.navbar.startMission', { query: searchQuery })}</p>
              </div>
              <kbd className="text-2xs px-1.5 py-0.5 rounded bg-secondary text-muted-foreground/70 shrink-0">
                &crarr;
              </kbd>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}