import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { type SearchItem } from '../../../hooks/useSearchIndex'
import { useMissions } from '../../../hooks/useMissions'
import { sanitizeForPrompt } from '../../../hooks/useMissionPromptBuilder'
import { useSidebarConfig, DISCOVERABLE_DASHBOARDS } from '../../../hooks/useSidebarConfig'
import { scrollToCard } from '../../../lib/scrollToCard'
import { emitGlobalSearchOpened, emitGlobalSearchQueried, emitGlobalSearchSelected, emitGlobalSearchAskAI } from '../../../lib/analytics'
import { useEscapeLayer, useModalState } from '../../../lib/modals'

const DISCOVERABLE_ROUTES = new Set(DISCOVERABLE_DASHBOARDS.map(d => d.href))
const AI_MISSION_TITLE_MAX_LENGTH = 50
const AI_MISSION_TITLE_TRUNCATED_LENGTH = 47

export function useSearchDropdownState() {
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
  const flatResultsRef = useRef<SearchItem[]>([])
  const totalCountRef = useRef(0)

  const isResultsPanelActive = isSearchOpen && !!searchQuery.trim()

  useEffect(() => {
    if (!isResultsPanelActive) {
      flatResultsRef.current = []
      totalCountRef.current = 0
    }
  }, [isResultsPanelActive])

  const handleResultsChange = (flatResults: SearchItem[], totalCount: number) => {
    flatResultsRef.current = flatResults
    totalCountRef.current = totalCount
  }

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
      initialPrompt: sanitizedQuery,
    })

    setSearchQuery('')
    closeSearch()
  }, [searchQuery, startMission, closeSearch])

  const sidebarHrefs = useMemo(() => {
    if (!sidebarConfig) return new Set<string>()
    return new Set(sidebarConfig.primaryNav.map(item => item.href))
  }, [sidebarConfig])

  const handleSelect = useCallback((item: SearchItem, index?: number) => {
    emitGlobalSearchSelected(item.category, index ?? 0)
    if (item.category === 'mission' && item.href?.startsWith('#mission:')) {
      const missionId = item.href.replace('#mission:', '')
      setActiveMission(missionId)
      openSidebar()
    } else if (item.href) {
      const baseHref = item.href.split('?')[0]
      if (item.scrollTarget && location.pathname === baseHref) {
        scrollToCard(item.scrollTarget)
      } else {
        const isDiscoverableNotInSidebar =
          item.category === 'page' &&
          DISCOVERABLE_ROUTES.has(item.href) &&
          !sidebarHrefs.has(item.href)

        const isDashboardResult = item.category === 'dashboard'

        let targetHref = item.href
        if (isDiscoverableNotInSidebar || isDashboardResult) {
          targetHref = `${item.href}${item.href.includes('?') ? '&' : '?'}customizeSidebar=true`
        }

        if (location.pathname === baseHref) {
          navigate(targetHref, { replace: true })
        } else {
          navigate(targetHref)
        }

        if (item.scrollTarget) {
          scrollToCard(item.scrollTarget)
        }
      }
    }
    setSearchQuery('')
    closeSearch()
  }, [sidebarHrefs, location.pathname, navigate, setActiveMission, openSidebar, closeSearch])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        closeSearch()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [closeSearch])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (searchRef.current && searchRef.current.offsetParent === null) return

      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault()
        event.stopPropagation()
        openSearch()
        requestAnimationFrame(() => inputRef.current?.focus())
        emitGlobalSearchOpened('keyboard')
      }

      if (!isSearchOpen) return

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

  useEffect(() => {
    setSelectedIndex(0)
  }, [searchQuery])

  useEffect(() => {
    if (!resultsRef.current) return
    const selected = resultsRef.current.querySelector('[data-selected="true"]')
    if (selected) {
      selected.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIndex])

  const handleInputFocus = () => {
    emitGlobalSearchOpened('click')
  }

  const handleInputBlur = () => {
    if (searchQuery.trim()) {
      emitGlobalSearchQueried(searchQuery.trim().length, totalCountRef.current)
    }
  }

  return {
    searchQuery,
    setSearchQuery,
    isSearchOpen,
    openSearch,
    selectedIndex,
    searchRef,
    inputRef,
    resultsRef,
    isResultsPanelActive,
    handleSelect,
    handleAskAI,
    handleResultsChange,
    handleInputFocus,
    handleInputBlur,
  }
}
