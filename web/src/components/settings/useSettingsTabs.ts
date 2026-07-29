import { useEffect, useState, useRef, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { useTheme } from '../../hooks/useTheme'
import { useTokenUsage } from '../../hooks/useTokenUsage'
import { useAIMode } from '../../hooks/useAIMode'
import { useLocalAgent } from '../../hooks/useLocalAgent'
import { useBackendHealth } from '../../hooks/useBackendHealth'
import { useAccessibility } from '../../hooks/useAccessibility'
import { useVersionCheck } from '../../hooks/useVersionCheck'
import { usePredictionSettings } from '../../hooks/usePredictionSettings'
import {
  usePersistedSettings,
  type SyncStatus,
} from '../../hooks/usePersistedSettings'
import {
  BANNER_DISMISS_MS,
  UI_FEEDBACK_TIMEOUT_MS,
  TOOLTIP_HIDE_DELAY_MS,
} from '../../lib/constants/network'
import { SETTINGS_NAV } from './Settings.parts'

/** Duration to suppress IntersectionObserver after a nav click (covers smooth scroll). */
const NAV_SCROLL_SUPPRESS_MS = 1200
/** Offset so scrolled-to sections land with breathing room (accounts for demo banner). */
const SCROLL_OFFSET = 80
/** Debounce interval for observer-driven activeSection updates (ms). */
const OBSERVER_DEBOUNCE_MS = 100

function getScrollContainer(): HTMLElement | null {
  return document.getElementById('main-content')
}

export function useSettingsTabs() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, refreshUser, isLoading: isUserLoading } = useAuth()
  const { themeId, setTheme, themes, currentTheme } = useTheme()
  const {
    usage,
    updateSettings: updateTokenSettings,
    resetUsage,
    isDemoData,
  } = useTokenUsage()
  const { mode, setMode, description } = useAIMode()
  const { health, isConnected, refresh: refreshAgent } = useLocalAgent()
  const { isInClusterMode } = useBackendHealth()
  const {
    colorBlindMode,
    setColorBlindMode,
    reduceMotion,
    setReduceMotion,
    highContrast,
    setHighContrast,
  } = useAccessibility()
  const { forceCheck: forceVersionCheck } = useVersionCheck()
  const {
    settings: predictionSettings,
    updateSettings: updatePredictionSettings,
    resetSettings: resetPredictionSettings,
  } = usePredictionSettings()
  const {
    restoredFromFile,
    syncStatus,
    lastSaved,
    filePath,
    exportSettings,
    importSettings,
  } = usePersistedSettings()

  const [activeSection, setActiveSection] = useState<string>('ai-mode-settings')
  const [showRestoredToast, setShowRestoredToast] = useState(false)

  // Suppresses IntersectionObserver updates during programmatic scrolls so the
  // sidebar highlight stays on the clicked item instead of flickering through
  // intermediate sections while the smooth scroll animates.
  const isNavScrollingRef = useRef(false)
  const navScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  // Show toast when settings are restored from backup file (after cache clear)
  useEffect(() => {
    if (restoredFromFile) {
      setShowRestoredToast(true)
      const timer = setTimeout(() => setShowRestoredToast(false), BANNER_DISMISS_MS)
      return () => clearTimeout(timer)
    }
  }, [restoredFromFile])

  const scrollToSection = useCallback((sectionId: string, smooth = true) => {
    const element = document.getElementById(sectionId)
    const container = getScrollContainer()
    if (!element || !container) return
    const containerRect = container.getBoundingClientRect()
    const elementRect = element.getBoundingClientRect()
    const y =
      elementRect.top - containerRect.top + container.scrollTop - SCROLL_OFFSET
    container.scrollTo({ top: y, behavior: smooth ? 'smooth' : 'auto' })
  }, [])

  // Handle deep linking — scroll to section based on URL hash.
  // Depends on both pathname and hash so it fires when navigating TO settings
  // from another page (KeepAlive keeps Settings mounted, so location updates
  // for all routes — we only act when actually on /settings).
  useEffect(() => {
    if (location.pathname !== '/settings') return
    if (isNavScrollingRef.current) return
    const hash = location.hash.replace('#', '')
    if (!hash) return

    // Retry scroll a few times — KeepAlive transitions display:none→contents
    // and the element may not have a layout rect on the first frame.
    let attempts = 0
    const maxAttempts = 5
    const tryScroll = () => {
      const element = document.getElementById(hash)
      const container = getScrollContainer()
      if (element && container && element.getBoundingClientRect().height > 0) {
        isNavScrollingRef.current = true
        if (navScrollTimerRef.current) clearTimeout(navScrollTimerRef.current)
        navScrollTimerRef.current = setTimeout(() => {
          isNavScrollingRef.current = false
        }, NAV_SCROLL_SUPPRESS_MS)

        scrollToSection(hash, false)
        setActiveSection(hash)
        element.classList.add('ring-2', 'ring-purple-500/50')
        setTimeout(
          () => element.classList.remove('ring-2', 'ring-purple-500/50'),
          UI_FEEDBACK_TIMEOUT_MS,
        )
      } else if (++attempts < maxAttempts) {
        requestAnimationFrame(tryScroll)
      }
    }
    const timer = setTimeout(tryScroll, TOOLTIP_HIDE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [location.pathname, location.hash, scrollToSection])

  // Track active section on scroll using IntersectionObserver.
  // Debounced to prevent a feedback loop: observer fires -> activeSection
  // changes -> sidebar re-renders -> sticky layout shifts -> observer fires again.
  useEffect(() => {
    const container = getScrollContainer()
    if (!container) return

    const allSectionIds = SETTINGS_NAV.flatMap((g) => g.items.map((i) => i.id))
    const visibleSections = new Map<string, number>()
    let debounceTimer: ReturnType<typeof setTimeout> | null = null

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            visibleSections.set(entry.target.id, entry.intersectionRatio)
          } else {
            visibleSections.delete(entry.target.id)
          }
        }
        if (isNavScrollingRef.current) return

        if (debounceTimer) clearTimeout(debounceTimer)
        debounceTimer = setTimeout(() => {
          for (const id of allSectionIds) {
            if (visibleSections.has(id)) {
              setActiveSection((prev) => (prev === id ? prev : id))
              break
            }
          }
        }, OBSERVER_DEBOUNCE_MS)
      },
      {
        root: container,
        rootMargin: '0px 0px -40% 0px',
        threshold: 0,
      },
    )

    for (const id of allSectionIds) {
      const el = document.getElementById(id)
      if (el) observer.observe(el)
    }

    return () => {
      observer.disconnect()
      if (debounceTimer) clearTimeout(debounceTimer)
    }
  }, [])

  const handleNavClick = (sectionId: string) => {
    isNavScrollingRef.current = true
    if (navScrollTimerRef.current) clearTimeout(navScrollTimerRef.current)
    navScrollTimerRef.current = setTimeout(() => {
      isNavScrollingRef.current = false
    }, NAV_SCROLL_SUPPRESS_MS)

    scrollToSection(sectionId)
    setActiveSection(sectionId)
    navigate(`#${sectionId}`, { replace: true })

    // Keep the clicked item visible in the sidebar's own scroll area without
    // cascading scrollIntoView to #main-content (which would cancel the smooth
    // scroll set by scrollToSection above).
    requestAnimationFrame(() => {
      const btn = document.querySelector<HTMLElement>(
        `[data-settings-nav="${sectionId}"]`,
      )
      if (!btn) return
      const sidebar = btn.closest<HTMLElement>('.overflow-y-auto')
      if (!sidebar || sidebar.id === 'main-content') return
      const btnRect = btn.getBoundingClientRect()
      const sidebarRect = sidebar.getBoundingClientRect()
      if (
        btnRect.top < sidebarRect.top ||
        btnRect.bottom > sidebarRect.bottom
      ) {
        const scrollDelta =
          btnRect.top -
          sidebarRect.top -
          sidebarRect.height / 2 +
          btnRect.height / 2
        sidebar.scrollBy({ top: scrollDelta, behavior: 'smooth' })
      }
    })
  }

  return {
    // navigation
    activeSection,
    showRestoredToast,
    contentRef,
    handleNavClick,
    // auth
    user,
    refreshUser,
    isUserLoading,
    // theme
    themeId,
    setTheme,
    themes,
    currentTheme,
    // token usage
    usage,
    updateTokenSettings,
    resetUsage,
    isDemoData,
    // ai mode
    mode,
    setMode,
    description,
    // local agent
    health,
    isConnected,
    refreshAgent,
    isInClusterMode,
    // accessibility
    colorBlindMode,
    setColorBlindMode,
    reduceMotion,
    setReduceMotion,
    highContrast,
    setHighContrast,
    // version check
    forceVersionCheck,
    // prediction settings
    predictionSettings,
    updatePredictionSettings,
    resetPredictionSettings,
    // persisted settings
    syncStatus,
    lastSaved,
    filePath,
    exportSettings,
    importSettings,
  }
}
