import { useState, useRef, useEffect, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  Search,
  Command,
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
import { useMissions } from '../../../hooks/useMissions'
import { useSidebarConfig, DISCOVERABLE_DASHBOARDS } from '../../../hooks/useSidebarConfig'
import { scrollToCard } from '../../../lib/scrollToCard'
import { useFeatureHints } from '../../../hooks/useFeatureHints'
import { FeatureHintTooltip } from '../../ui/FeatureHintTooltip'
import { emitGlobalSearchOpened, emitGlobalSearchQueried, emitGlobalSearchSelected, emitGlobalSearchAskAI } from '../../../lib/analytics'
import { useModalState } from '../../../lib/modals'

/** Routes for dashboards that are discoverable but not shown by default in the sidebar */
const DISCOVERABLE_ROUTES = new Set(DISCOVERABLE_DASHBOARDS.map(d => d.href))

const CATEGORY_CONFIG: Record<SearchCategory, { label: string; icon: typeof Server }> = {
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

/**
 * SearchResultsPanel is rendered only when the search bar is open AND has a
 * non-empty query. This means useSearchIndex (and its 7 expensive API hooks)
 * are never mounted until the user actually types a search query, avoiding
 * unnecessary API calls on every page load. See issue #3871.
 */
function SearchResultsPanel({
  searchQuery,
  selectedIndex,
  onSelect,
  onAskAI,
  resultsRef,
  onResultsChange }: {
  searchQuery: string
  selectedIndex: number
  onSelect: (item: SearchItem, index: number) => void
  onAskAI: () => void
  resultsRef: React.RefObject<HTMLDivElement | null>
  /** Called when results change so the parent can handle Enter key selection and analytics */
  onResultsChange: (flatResults: SearchItem[], totalCount: number) => void
}) {
  const { t } = useTranslation()
  const { results, totalCount } = useSearchIndex(searchQuery)

  // Flatten results into a single list for keyboard navigation
  const flatResults = useMemo(() => {
    const flat: SearchItem[] = []
    for (const cat of CATEGORY_ORDER) {
      const items = results.get(cat)
      if (items) flat.push(...items)
    }
    return flat
  }, [results])

  // Sync flat results and total count to parent for keyboard handling + analytics
  useEffect(() => {
    onResultsChange(flatResults, totalCount)
  }, [flatResults, totalCount, onResultsChange])

  const askAIIndex = flatResults.length

  // Track flat index across categories
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
                {/* Category header */}
                <div className="flex items-center gap-2 px-3 pt-2.5 pb-1">
                  <CategoryIcon className="w-3.5 h-3.5 text-muted-foreground/60" />
                  <span className="text-[11px] font-medium text-muted-foreground/60 uppercase tracking-wider">
                    {config.label}
                  </span>
                </div>
                {/* Category items */}
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
                      <span className="text-2xs px-1.5 py-0.5 rounded bg-secondary text-muted-foreground/70 shrink-0">
                        {config.label.toLowerCase()}
                      </span>
                    </button>
                  )
                })}
              </div>
            )
          })}
          {/* Total count footer */}
          {totalCount > flatResults.length && (
            <div className="px-4 py-2 text-xs text-muted-foreground/50 text-center border-t border-border/50">
              {t('layout.navbar.showingResults', { shown: flatResults.length, total: totalCount })}
            </div>
          )}

          {/* Ask AI action */}
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
          {/* No results - show Ask AI prominently */}
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

export function SearchDropdown() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const { openSidebar, setActiveMission, startMission } = useMissions()
  const { config: sidebarConfig } = useSidebarConfig()
  const [searchQuery, setSearchQuery] = useState('')
  const { isOpen: isSearchOpen, open: openSearch, close: closeSearch } = useModalState()
  const [selectedIndex, setSelectedIndex] = useState(0)
  const searchRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)
  // Flat results from the SearchResultsPanel child, used for keyboard Enter handling.
  // Total count is tracked for analytics (onBlur emits query stats).
  const flatResultsRef = useRef<SearchItem[]>([])
  const totalCountRef = useRef(0)
  const cmdKHint = useFeatureHints('cmd-k')
  const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform || '')
  const searchShortcut = isMac ? '⌘K' : 'Ctrl+K'

  // Whether the results panel is active (mounted).
  // The panel -- and its expensive useSearchIndex hook -- only mount when
  // the search bar is open AND the user has typed a non-empty query.
  const isResultsPanelActive = isSearchOpen && !!searchQuery.trim()

  // Clear stale results when the panel unmounts
  useEffect(() => {
    if (!isResultsPanelActive) {
      flatResultsRef.current = []
      totalCountRef.current = 0
    }
  }, [isResultsPanelActive])

  // Callback for SearchResultsPanel to sync flat results to parent
  const handleResultsChange = (flatResults: SearchItem[], totalCount: number) => {
    flatResultsRef.current = flatResults
    totalCountRef.current = totalCount
  }

  // Create a custom mission from the search query
  const handleAskAI = () => {
    if (!searchQuery.trim()) return

    const query = searchQuery.trim()
    emitGlobalSearchAskAI(query.length)
    startMission({
      title: query.length > 50 ? query.substring(0, 47) + '...' : query,
      description: 'Custom AI mission from search',
      type: 'custom',
      initialPrompt: query })

    setSearchQuery('')
    closeSearch()
  }

  // Check if a page route is a discoverable dashboard not currently in the sidebar
  const sidebarHrefs = (() => {
    if (!sidebarConfig) return new Set<string>()
    return new Set(sidebarConfig.primaryNav.map(item => item.href))
  })()

  const handleSelect = (item: SearchItem, index?: number) => {
    emitGlobalSearchSelected(item.category, index ?? 0)
    // Mission items open the sidebar instead of navigating
    if (item.category === 'mission' && item.href?.startsWith('#mission:')) {
      const missionId = item.href.replace('#mission:', '')
      setActiveMission(missionId)
      openSidebar()
    } else if (item.href) {
      // If we're already on the target route and there's a scroll target,
      // just scroll directly without navigating
      const baseHref = item.href.split('?')[0]
      if (item.scrollTarget && location.pathname === baseHref) {
        scrollToCard(item.scrollTarget)
      } else {
        // For discoverable dashboards not in the sidebar, append customizeSidebar
        // param so the page auto-opens the sidebar customizer
        const isDiscoverableNotInSidebar =
          item.category === 'page' &&
          DISCOVERABLE_ROUTES.has(item.href) &&
          !sidebarHrefs.has(item.href)

        // Dashboard search results should open the sidebar customizer
        const isDashboardResult = item.category === 'dashboard'

        let targetHref = item.href
        if (isDiscoverableNotInSidebar || isDashboardResult) {
          targetHref = `${item.href}${item.href.includes('?') ? '&' : '?'}customizeSidebar=true`
        }

        // If already on the same path, force navigation by using replace
        // so ?addCard=true or ?customizeSidebar=true params are picked up
        if (location.pathname === baseHref) {
          navigate(targetHref, { replace: true })
        } else {
          navigate(targetHref)
        }
        // After navigation, scroll to the card if there's a scroll target
        if (item.scrollTarget) {
          scrollToCard(item.scrollTarget)
        }
      }
    }
    setSearchQuery('')
    closeSearch()
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        closeSearch()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [closeSearch])

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Skip if this instance's container is not visible — prevents duplicate
      // handlers when SearchDropdown is mounted in both desktop and mobile slots (#5711)
      if (searchRef.current && searchRef.current.offsetParent === null) return

      // Open search with Cmd+K
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault()
        // #6225: stop propagation so FloatingDashboardActions's bubble-phase
        // listener does not also fire on the same Ctrl+K — without this,
        // both the search dropdown and the dashboard actions menu opened
        // simultaneously and required two Escape presses to close. Paired
        // with the `capture: true` on the addEventListener call below so
        // this listener wins regardless of registration order.
        event.stopPropagation()
        inputRef.current?.focus()
        openSearch()
        emitGlobalSearchOpened('keyboard')
      }

      if (!isSearchOpen) return

      // Total selectable items: flat results + 1 for "Ask AI"
      const flatResults = flatResultsRef.current
      const totalSelectableItems = flatResults.length + 1
      const askAIIndex = flatResults.length

      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setSelectedIndex(prev => Math.min(prev + 1, totalSelectableItems - 1))
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        setSelectedIndex(prev => Math.max(prev - 1, 0))
      } else if (event.key === 'Enter') {
        event.preventDefault()
        if (selectedIndex === askAIIndex || !isResultsPanelActive) {
          handleAskAI()
        } else if (flatResults[selectedIndex]) {
          handleSelect(flatResults[selectedIndex], selectedIndex)
        }
      } else if (event.key === 'Escape') {
        closeSearch()
        inputRef.current?.blur()
      }
    }

    // #6225: capture phase so this listener fires BEFORE bubble-phase
    // handlers (e.g. FloatingDashboardActions) — paired with the
    // event.stopPropagation() inside the Ctrl+K branch above. The third
    // arg must match between addEventListener and removeEventListener.
    document.addEventListener('keydown', handleKeyDown, true)
    return () => document.removeEventListener('keydown', handleKeyDown, true)
  }, [isSearchOpen, isResultsPanelActive, selectedIndex, handleSelect, handleAskAI, openSearch, closeSearch])

  // Reset selected index when results change
  useEffect(() => {
    setSelectedIndex(0)
  }, [searchQuery])

  // Scroll selected item into view
  useEffect(() => {
    if (!resultsRef.current) return
    const selected = resultsRef.current.querySelector('[data-selected="true"]')
    if (selected) {
      selected.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIndex])

  return (
    <div data-tour="search" data-testid="global-search" className="flex-1 min-w-0" ref={searchRef}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          ref={inputRef}
          type="text"
          id="global-search"
          name="global-search"
          data-testid="global-search-input"
          autoComplete="off"
          value={searchQuery}
          onChange={e => {
            setSearchQuery(e.target.value)
            openSearch()
          }}
          onFocus={() => { openSearch(); cmdKHint.action(); emitGlobalSearchOpened('click') }}
          onBlur={() => { if (searchQuery.trim()) emitGlobalSearchQueried(searchQuery.trim().length, totalCountRef.current) }}
          placeholder={t('layout.navbar.searchPlaceholder')}
          className="w-full pl-10 pr-16 py-2 bg-secondary rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-purple-500/50"
        />
        <kbd className="absolute right-3 top-1/2 -translate-y-1/2 hidden sm:flex items-center gap-1 px-1.5 py-0.5 text-xs text-muted-foreground bg-secondary rounded" aria-hidden="true">
          <Command className="w-3 h-3" /><span>K</span>
        </kbd>

        {/* Cmd+K feature hint tooltip */}
        {cmdKHint.isVisible && !isSearchOpen && (
          <FeatureHintTooltip
            message={`Press ${searchShortcut} to search dashboards, cards, clusters, and more`}
            onDismiss={cmdKHint.dismiss}
            placement="bottom"
          />
        )}

        {/* Search results panel -- only mounts when query is non-empty.
            This ensures useSearchIndex (and its 7 API hooks) never run
            until the user actually types a search query. */}
        {isResultsPanelActive && (
          <SearchResultsPanel
            searchQuery={searchQuery}
            selectedIndex={selectedIndex}
            onSelect={handleSelect}
            onAskAI={handleAskAI}
            resultsRef={resultsRef}
            onResultsChange={handleResultsChange}
          />
        )}
      </div>
    </div>
  )
}
