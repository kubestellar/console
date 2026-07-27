import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  Search,
  Command } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { type SearchItem } from '../../../hooks/useSearchIndex'
import { useMissions } from '../../../hooks/useMissions'
import { sanitizeForPrompt } from '../../../hooks/useMissionPromptBuilder'
import { useSidebarConfig, DISCOVERABLE_DASHBOARDS } from '../../../hooks/useSidebarConfig'
import { scrollToCard } from '../../../lib/scrollToCard'
import { useFeatureHints } from '../../../hooks/useFeatureHints'
import { FeatureHintTooltip } from '../../ui/FeatureHintTooltip'
import { emitGlobalSearchOpened, emitGlobalSearchQueried, emitGlobalSearchSelected, emitGlobalSearchAskAI } from '../../../lib/analytics'
import { useEscapeLayer, useModalState } from '../../../lib/modals'
import { SearchResultsPanel } from './SearchResultsPanel'

const DISCOVERABLE_ROUTES = new Set(DISCOVERABLE_DASHBOARDS.map(d => d.href))
const AI_MISSION_TITLE_MAX_LENGTH = 50
const AI_MISSION_TITLE_TRUNCATED_LENGTH = 47

interface SearchDropdownProps {
  autoFocusOnMount?: boolean
}

export function SearchDropdown({ autoFocusOnMount = false }: SearchDropdownProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const { openSidebar, setActiveMission, startMission } = useMissions()
  const { config: sidebarConfig } = useSidebarConfig()
  const [searchQuery, setSearchQuery] = useState('')
  const { isOpen: isSearchOpen, open: openSearch, close: closeSearch } = useModalState()
  const isTopEscapeLayer = useEscapeLayer(isSearchOpen)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const searchRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)
  const previousPathnameRef = useRef(location.pathname)
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
  const handleAskAI = useCallback(() => {
    if (!searchQuery.trim()) return

    const query = searchQuery.trim()
    const sanitizedQuery = sanitizeForPrompt(query)
    if (!sanitizedQuery) return

    emitGlobalSearchAskAI(query.length)
    startMission({
      title: sanitizedQuery.length > AI_MISSION_TITLE_MAX_LENGTH
        ? sanitizedQuery.substring(0, AI_MISSION_TITLE_TRUNCATED_LENGTH) + '...'
        : sanitizedQuery,
      description: 'Custom AI mission from search',
      type: 'custom',
      initialPrompt: sanitizedQuery })

    setSearchQuery('')
    closeSearch()
  }, [searchQuery, startMission, closeSearch])

  // Check if a page route is a discoverable dashboard not currently in the sidebar
  const sidebarHrefs = useMemo(() => {
    if (!sidebarConfig) return new Set<string>()
    return new Set(sidebarConfig.primaryNav.map(item => item.href))
  }, [sidebarConfig])

  const handleSelect = useCallback((item: SearchItem, index?: number) => {
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
  }, [sidebarHrefs, location.pathname, navigate, setActiveMission, openSidebar, closeSearch])

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
        openSearch()
        // Defer focus until after React commits the open state so inputRef is
        // guaranteed to be attached and the input is focusable (#find-and-search).
        requestAnimationFrame(() => inputRef.current?.focus())
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
        if (!isTopEscapeLayer()) return
        event.preventDefault()
        event.stopPropagation()
        closeSearch()
        inputRef.current?.blur()
      }
    }

    // #6225: capture phase so this listener fires BEFORE bubble-phase
    // handlers (e.g. FloatingDashboardActions) — paired with the
    // event.stopPropagation() inside the Ctrl+K branch above. The third
    // arg must match between addEventListener and removeEventListener.
    document.addEventListener('keydown', handleKeyDown, true)
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isSearchOpen, isResultsPanelActive, selectedIndex, handleSelect, handleAskAI, openSearch, closeSearch, isTopEscapeLayer])

  useEffect(() => {
    if (previousPathnameRef.current !== location.pathname) {
      setSearchQuery('')
      setSelectedIndex(0)
      closeSearch()
      previousPathnameRef.current = location.pathname
      return
    }

    previousPathnameRef.current = location.pathname
  }, [location.pathname, closeSearch])

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
          autoFocus={autoFocusOnMount}
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
