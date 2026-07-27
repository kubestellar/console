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
}: {
  searchQuery: string
  selectedIndex: number | null
  onSelect: (item: SearchItem) => void
  onAskAI?: () => void
}) {
  const { t } = useTranslation()
  const { items, index } = useSearchIndex()

  const groupedResults = useMemo(() => {
    if (!searchQuery.trim()) return {}

    const results: Record<SearchCategory, SearchItem[]> = {}

    for (const category of CATEGORY_ORDER) {
      results[category] = (index[category] ?? []).filter((item: SearchItem) =>
        item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.description?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false),
      )
    }

    return results
  }, [searchQuery, index])

  const flatResults = useMemo(
    () => Object.values(groupedResults).flat(),
    [groupedResults],
  )

  useEffect(() => {
    if (flatResults.length === 0 && selectedIndex !== null) {
      onSelect({} as SearchItem)
    }
  }, [flatResults.length, selectedIndex, onSelect])

  if (flatResults.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-6 text-center">
        <div className="text-sm text-muted-foreground">{t('search.noResults')}</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 p-2">
      {CATEGORY_ORDER.map((category) => {
        const categoryItems = groupedResults[category]

        if (!categoryItems || categoryItems.length === 0) return null

        const { label, icon: Icon } = CATEGORY_CONFIG[category]

        return (
          <div key={category} className="flex flex-col gap-2">
            <div className="flex items-center gap-2 px-2 py-1">
              <Icon className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
              <span className="ml-auto text-xs font-semibold uppercase tracking-wide text-muted-foreground">{categoryItems.length}</span>
            </div>
            {categoryItems.map((item, idx) => {
              const globalIdx = flatResults.indexOf(item)
              const isSelected = globalIdx === selectedIndex

              return (
                <button
                  key={idx}
                  onClick={() => onSelect(item)}
                  className={`flex flex-col items-start gap-0.5 rounded border px-3 py-2 text-left transition-colors ${
                    isSelected
                      ? 'border-accent bg-accent/20 text-accent'
                      : 'border-transparent bg-secondary hover:border-border text-foreground'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={RESULT_TYPE_CHIP_CLASS}>{item.type}</span>
                    {item.badge && <span className="text-xs text-muted-foreground">{item.badge}</span>}
                  </div>
                  <span className="text-sm font-medium">{item.title}</span>
                  {item.description && <span className="text-xs text-muted-foreground">{item.description}</span>}
                </button>
              )
            })}
          </div>
        )
      })}
      {onAskAI && (
        <button
          onClick={onAskAI}
          className="mt-2 flex items-center justify-center gap-2 rounded border border-dashed border-border px-3 py-2 text-sm text-muted-foreground hover:border-foreground hover:text-foreground transition-colors"
        >
          <Bot className="h-4 w-4" />
          {t('search.askAI')}
        </button>
      )}
    </div>
  )
}