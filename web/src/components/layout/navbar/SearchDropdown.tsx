import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
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
  HardDrive,
} from 'lucide-react'
import { useSearchIndex, CATEGORY_ORDER, type SearchCategory, type SearchItem } from '../../../hooks/useSearchIndex'
import { useMissions } from '../../../hooks/useMissions'
import { useDashboardContext } from '../../../hooks/useDashboardContext'
import { CARD_TITLES } from '../../cards/CardWrapper'

const CATEGORY_CONFIG: Record<SearchCategory, { label: string; icon: typeof Server }> = {
  page: { label: 'Pages', icon: LayoutDashboard },
  card: { label: 'Cards', icon: LayoutGrid },
  stat: { label: 'Stats', icon: BarChart3 },
  setting: { label: 'Settings', icon: Settings },
  cluster: { label: 'Clusters', icon: Server },
  namespace: { label: 'Namespaces', icon: FolderOpen },
  deployment: { label: 'Deployments', icon: Box },
  pod: { label: 'Pods', icon: Container },
  service: { label: 'Services', icon: Globe },
  mission: { label: 'AI Missions', icon: Bot },
  dashboard: { label: 'Dashboards', icon: LayoutDashboard },
  helm: { label: 'Helm Releases', icon: Package },
  node: { label: 'Nodes', icon: HardDrive },
}

export function SearchDropdown() {
  const navigate = useNavigate()
  const { openSidebar, setActiveMission } = useMissions()
  const { setPendingRestoreCard } = useDashboardContext()
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const searchRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)

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

  const handleSelect = useCallback((item: SearchItem) => {
    // Mission items open the sidebar instead of navigating
    if (item.category === 'mission' && item.href?.startsWith('#mission:')) {
      const missionId = item.href.replace('#mission:', '')
      setActiveMission(missionId)
      openSidebar()
    } else if (item.href?.startsWith('#addCard:')) {
      // Card items: add the card to the dashboard and navigate there
      const cardType = item.href.replace('#addCard:', '')
      setPendingRestoreCard({
        cardType,
        cardTitle: CARD_TITLES[cardType] || item.name,
        config: {},
      })
      navigate('/')
    } else if (item.href) {
      navigate(item.href)
    }
    setSearchQuery('')
    setIsSearchOpen(false)
  }, [navigate, setActiveMission, openSidebar, setPendingRestoreCard])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsSearchOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Open search with Cmd+K
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault()
        inputRef.current?.focus()
        setIsSearchOpen(true)
      }

      if (!isSearchOpen) return

      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setSelectedIndex(prev => Math.min(prev + 1, flatResults.length - 1))
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        setSelectedIndex(prev => Math.max(prev - 1, 0))
      } else if (event.key === 'Enter' && flatResults[selectedIndex]) {
        event.preventDefault()
        handleSelect(flatResults[selectedIndex])
      } else if (event.key === 'Escape') {
        setIsSearchOpen(false)
        inputRef.current?.blur()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isSearchOpen, flatResults, selectedIndex, handleSelect])

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

  // Track flat index across categories
  let flatIndex = 0

  return (
    <div data-tour="search" className="flex-1 max-w-md mx-8" ref={searchRef}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          ref={inputRef}
          type="text"
          id="global-search"
          name="global-search"
          autoComplete="off"
          value={searchQuery}
          onChange={e => {
            setSearchQuery(e.target.value)
            setIsSearchOpen(true)
          }}
          onFocus={() => setIsSearchOpen(true)}
          placeholder="Search pages, cards, clusters, pods..."
          className="w-full pl-10 pr-16 py-2 bg-secondary/50 rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/50"
        />
        <kbd className="absolute right-3 top-1/2 -translate-y-1/2 hidden sm:flex items-center gap-1 px-1.5 py-0.5 text-xs text-muted-foreground bg-secondary rounded">
          <Command className="w-3 h-3" />K
        </kbd>

        {/* Search results dropdown */}
        {isSearchOpen && searchQuery.trim() && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-card border border-border rounded-lg shadow-xl overflow-hidden z-[60]">
            {flatResults.length > 0 ? (
              <div ref={resultsRef} className="py-1 max-h-96 overflow-y-auto">
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
                            data-selected={isSelected}
                            onClick={() => handleSelect(item)}
                            className={`w-full flex items-center gap-3 px-4 py-1.5 text-left transition-colors ${
                              isSelected
                                ? 'bg-purple-500/20 text-foreground'
                                : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
                            }`}
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{item.name}</p>
                              {item.description && (
                                <p className="text-xs text-muted-foreground truncate">{item.description}</p>
                              )}
                            </div>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground/70 shrink-0">
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
                    Showing {flatResults.length} of {totalCount} results
                  </div>
                )}
              </div>
            ) : (
              <div className="px-4 py-8 text-center">
                <p className="text-muted-foreground text-sm">No results for &quot;{searchQuery}&quot;</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
