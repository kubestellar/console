import { useState, useEffect, Suspense, useCallback } from 'react'
import { safeLazy } from '../../../lib/safeLazy'
import { useTranslation } from 'react-i18next'
import { useNavigate, useLocation } from 'react-router-dom'
import { Sun, Moon, Monitor, Menu, Search, X, MoreVertical, ExternalLink, Sparkles } from 'lucide-react'
import { useAuth } from '../../../lib/auth'
import { useSidebarConfig } from '../../../hooks/useSidebarConfig'
import { useTheme } from '../../../hooks/useTheme'
import { useMobile } from '../../../hooks/useMobile'
import { useBranding } from '../../../hooks/useBranding'
import { useMissions } from '../../../hooks/useMissions'
import { LearnDropdown } from './LearnDropdown'
import { LogoWithStar } from '../../ui/LogoWithStar'
import { Tooltip } from '../../ui/Tooltip'
import { UserProfileDropdown } from '../UserProfileDropdown'
import { CompactErrorBoundary } from '../../CompactErrorBoundary'
import { AlertBadge } from '../../ui/AlertBadge'
import { FeatureRequestButton } from '../../feedback'
// Lazy-load SearchDropdown — it imports useSearchIndex which pulls in 5 MCP
// modules (~135 KB). The search bar appears after the chunk loads (near-instant).
const SearchDropdown = safeLazy(() => import('./SearchDropdown'), 'SearchDropdown')

// Lazy-load AgentSelector — agent UI components (~41 KB) are only needed
// when a local kc-agent is available (never on console.kubestellar.io).
const AgentSelector = safeLazy(() => import('../../agent/AgentSelector'), 'AgentSelector')
import { TokenUsageWidget } from './TokenUsageWidget'
import { ClusterFilterPanel } from './ClusterFilterPanel'
import { AgentStatusIndicator } from './AgentStatusIndicator'
import { RotatingTagline } from './RotatingTagline'
import { UpdateIndicator } from './UpdateIndicator'
import { StreakBadge } from './StreakBadge'
import { useKeyboardNav } from '../../../hooks/useKeyboardNav'
import { ROUTES } from '../../../config/routes'
import { NAVBAR_HEIGHT_PX } from '../../../lib/constants/ui'

interface NavbarProps {
  /** Pixel offset from top when a dev-mode bar or other element sits above the navbar */
  topOffset?: number
}

export function Navbar({ topOffset = 0 }: NavbarProps) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { theme, toggleTheme } = useTheme()
  const location = useLocation()
  const [showMobileMore, setShowMobileMore] = useState(false)
  const [showMobileSearch, setShowMobileSearch] = useState(false)
  const { config, toggleMobileSidebar, closeMobileSidebar } = useSidebarConfig()
  const { isMobile } = useMobile()
  const { t } = useTranslation()
  const branding = useBranding()
  const { missions, isSidebarOpen, openSidebar } = useMissions()
  const missionsNeedingAttention = missions.filter((mission) => (
    mission.status === 'waiting_input' || mission.status === 'failed'
  )).length

  // Close mobile more menu on route change
  useEffect(() => {
    setShowMobileMore(false)
    setShowMobileSearch(false)
  }, [location.pathname])

  // Keyboard navigation for overflow menu
  const closeOverflowMenu = useCallback(() => setShowMobileMore(false), [])
  const { containerRef: overflowMenuRef, focusMatchingItem: focusFirstOverflowItem, handleKeyDown: handleOverflowKeyDown } = useKeyboardNav({
    orientation: 'vertical',
    onEscape: closeOverflowMenu,
  })

  // Focus first item when overflow menu opens
  useEffect(() => {
    if (showMobileMore) {
      // Allow DOM to render before focusing
      requestAnimationFrame(() => focusFirstOverflowItem())
    }
  }, [showMobileMore, focusFirstOverflowItem])

  useEffect(() => {
    if (!isMobile) {
      setShowMobileSearch(false)
    }
  }, [isMobile])

  return (
    <nav data-tour="navbar" style={{ top: topOffset }} className="fixed left-0 right-0 h-16 glass z-sticky px-3 md:px-6 flex items-center justify-between overflow-x-clip">
      {isMobile && showMobileSearch && (
        <div className="absolute inset-0 z-modal flex items-center gap-2 bg-background/95 px-3 backdrop-blur-md">
          <div className="min-w-0 flex-1">
            <Suspense fallback={null}><SearchDropdown autoFocusOnMount /></Suspense>
          </div>
          <button
            type="button"
            data-testid="navbar-mobile-search-close"
            onClick={() => setShowMobileSearch(false)}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg transition-colors hover:bg-secondary"
            aria-label={t('actions.close')}
          >
            <X className="h-5 w-5 text-foreground" />
          </button>
        </div>
      )}
      {/* Left side: Hamburger + Logo — shrink-0 so logo is never compressed */}
      <div className="flex items-center gap-2 md:gap-3 shrink-0">
        {/* Hamburger menu - mobile only */}
        <button
          data-testid="mobile-menu-toggle"
          onClick={toggleMobileSidebar}
          className="p-2 min-w-[44px] min-h-[44px] flex lg:hidden items-center justify-center rounded-lg transition-colors hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
          aria-label={config.isMobileOpen ? t('navbar.closeMenu') : t('navbar.openMenu')}
        >
          {config.isMobileOpen ? (
            <X className="w-5 h-5 text-foreground" />
          ) : (
            <Menu className="w-5 h-5 text-foreground" />
          )}
        </button>

        {/* Logo - clickable to navigate home */}
        <button
          type="button"
          data-testid="navbar-home-btn"
          onClick={() => navigate(ROUTES.HOME)}
          className="flex items-center gap-2 md:gap-3 p-2 -m-2 min-w-[44px] min-h-[44px] hover:opacity-80 transition-opacity cursor-pointer"
          aria-label={t('navbar.goHome')}
        >
          <LogoWithStar className="w-8 h-8 md:w-9 md:h-9" showStar={false} />
        </button>
        <button
          type="button"
          onClick={() => navigate(ROUTES.HOME)}
          className="hidden lg:flex flex-col leading-tight justify-center min-h-[44px] hover:opacity-80 transition-opacity text-left cursor-pointer"
          title={t('navbar.goHome')}
        >
          <span className="text-base md:text-lg font-semibold text-foreground">{branding.appName}</span>
          <RotatingTagline />
        </button>
        {__DEV_MODE__ && (
          <span className="hidden sm:inline-flex items-center justify-center px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-green-500/20 text-green-400 border border-green-500/30 rounded-full" title={t('layout.navbar.devModeTitle')}>
            DEV
          </span>
        )}
        <Tooltip content={t('help.viewDocs')} side="bottom">
          <a
            href={branding.docsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden lg:flex items-center p-1.5 hover:bg-secondary rounded-md transition-colors cursor-pointer"
            aria-label={t('navbar.viewDocs')}
          >
            <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
          </a>
        </Tooltip>
      </div>

      {/* Search - hidden on small mobile; min-w-0 prevents layout overflow
           when the right-side AI Mission button is visible (#4409).
           min-w-[120px] ensures the input stays usable at narrow widths (#4955). */}
      <div className="hidden sm:flex flex-1 min-w-[120px] max-w-xl mx-4">
        <Suspense fallback={null}><SearchDropdown /></Suspense>
      </div>

      {/* Right side — no shrink-0 here so the container participates in flex
           negotiation with the search bar, preventing overlap when the AI Mission
           button is visible (#4409). Individual critical items use shrink-0. */}
      <div className="flex items-center gap-1 md:gap-3 min-w-0">
        {/* Core desktop items: lg+ (1024px) */}
        <div data-testid="navbar-core-actions" className="hidden lg:flex items-center gap-2">
          {/* Unified Filter */}
          <ClusterFilterPanel />

          {/* Agent Status + Selector — status (Demo/AI pill) on left, selector on right */}
          <AgentStatusIndicator />
          <Suspense fallback={null}><AgentSelector compact /></Suspense>
        </div>

        {/* Extended desktop items: 2xl+ (1536px) — keep these in the overflow
             menu at 1280px so alerts and the user menu remain clickable. */}
        <div data-testid="navbar-extended-actions" className="hidden 2xl:flex items-center gap-2">
          {/* Update Indicator */}
          <UpdateIndicator />

          {/* Visit Streak */}
          <StreakBadge />

          {/* Token Usage */}
          <TokenUsageWidget />

          {/* Feature Request (includes notifications) */}
          <FeatureRequestButton />
        </div>

        {/* Always-visible items — shrink-0 so theme toggle, alerts, user menu
             are never squeezed invisible at intermediate widths (#3191) */}
        <div className="flex items-center gap-1 md:gap-2 shrink-0">
          {/* Search stays accessible on mobile via an inline trigger */}
          <button
            type="button"
            data-testid="navbar-mobile-search-btn"
            onClick={() => {
              closeMobileSidebar()
              setShowMobileMore(false)
              setShowMobileSearch(true)
            }}
            className="flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:bg-secondary sm:hidden"
            aria-label={t('layout.navbar.searchPlaceholder')}
          >
            <Search className="h-5 w-5 text-muted-foreground" />
          </button>

          {/* Tour trigger - desktop/tablet icon, mobile entry stays in overflow menu */}
          <div className="hidden sm:block">
            <LearnDropdown />
          </div>

          {/* AI Missions stays directly reachable at the default 1280px E2E viewport.
              The label expands only at 2xl so the 1280px user menu cannot overflow. */}
          {!isSidebarOpen && (
            <Tooltip content={t('missionSidebar.openAIMissions')} side="bottom">
              <button
                type="button"
                onClick={openSidebar}
                data-tour="ai-missions-toggle"
                data-testid="navbar-ai-missions-btn"
                className="relative hidden xl:flex h-9 w-9 2xl:w-auto items-center justify-center gap-1.5 rounded-lg border border-primary/20 bg-primary/10 px-0 2xl:px-3 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary/20"
                aria-label={t('missionSidebar.openAIMissions')}
              >
                <Sparkles className="w-4 h-4" />
                <span className="hidden 2xl:inline">{t('missionSidebar.aiMissions')}</span>
                {missionsNeedingAttention > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 flex items-center justify-center w-5 h-5 text-[10px] font-bold bg-primary text-primary-foreground rounded-full animate-pulse">
                    {missionsNeedingAttention}
                  </span>
                )}
              </button>
            </Tooltip>
          )}

          {/* Theme toggle */}
          <Tooltip content={t('help.themeToggle')} side="bottom">
            <button
              onClick={toggleTheme}
              className="p-2 w-9 h-9 flex items-center justify-center shrink-0 hover:bg-secondary rounded-lg transition-colors cursor-pointer"
              aria-label={t('navbar.themeToggle', { theme })}
            >
              {theme === 'dark' ? (
                <Moon className="w-5 h-5 text-muted-foreground" />
              ) : theme === 'light' ? (
                <Sun className="w-5 h-5 text-amber-600 dark:text-yellow-400" />
              ) : (
                <Monitor className="w-5 h-5 text-muted-foreground" />
              )}
            </button>
          </Tooltip>

          {/* Alerts */}
          <AlertBadge />
        </div>

        {/* Overflow menu — visible below 2xl for items hidden at narrower widths */}
        <div className="relative 2xl:hidden shrink-0">
          <button
            data-testid="navbar-overflow-btn"
            onClick={() => setShowMobileMore(!showMobileMore)}
            className="p-2 min-w-[44px] min-h-[44px] hover:bg-secondary rounded-lg transition-colors cursor-pointer"
            aria-label={t('navbar.moreOptions')}
            aria-haspopup="menu"
            aria-expanded={showMobileMore}
          >
            <MoreVertical className="w-5 h-5 text-muted-foreground" />
          </button>
          {showMobileMore && (
            <>
              {/* Backdrop */}
              <div
                className="fixed inset-0 bg-black/60 backdrop-blur-xs z-overlay"
                onClick={() => setShowMobileMore(false)}
              />
              {/* Bottom sheet menu on mobile */}
              <div
                ref={overflowMenuRef as React.RefObject<HTMLDivElement>}
                role="menu"
                aria-label={t('navbar.moreOptions')}
                onKeyDown={handleOverflowKeyDown}
                className={`fixed ${isMobile ? 'inset-x-0 bottom-0 rounded-t-2xl max-h-[60vh] max-h-[60dvh]' : 'right-4 w-64 rounded-lg'} bg-card border border-border shadow-xl z-modal overflow-hidden`} style={isMobile ? undefined : { top: topOffset + NAVBAR_HEIGHT_PX }}>
                {/* Drag handle for mobile */}
                {isMobile && (
                  <div className="flex justify-center py-2">
                    <div className="w-10 h-1 bg-muted-foreground/30 rounded-full" />
                  </div>
                )}
                <div className={`${isMobile ? 'max-h-[calc(60vh-24px)] max-h-[calc(60dvh-24px)]' : ''} overflow-y-auto py-2`}>
                  {/* Search on mobile */}
                  <div className="px-3 py-2 sm:hidden">
                    <Suspense fallback={null}><SearchDropdown /></Suspense>
                  </div>
                  <div className="border-t border-border my-2 sm:hidden" />

                  {/* Items only hidden at <md (768px): filter, agent status, agent selector */}
                  <div className="md:hidden">
                    <div className="px-3 py-2">
                      <ClusterFilterPanel showLabel />
                    </div>
                    <div className="px-3 py-2">
                      <AgentStatusIndicator showLabel />
                    </div>
                    <div className="px-3 py-2">
                      <Suspense fallback={null}><AgentSelector compact /></Suspense>
                    </div>
                    <div className="border-t border-border mx-3 my-1" />
                  </div>

                  {/* Items hidden at <xl (1280px): update, token usage, feature request, tour */}
                  <div className="px-3 py-2">
                    <UpdateIndicator showLabel />
                  </div>
                  <div className="px-3 py-2">
                    <TokenUsageWidget showLabel />
                  </div>
                  <div className="px-3 py-2">
                    <FeatureRequestButton showLabel />
                  </div>
                  <div className="px-3 py-2">
                    <LearnDropdown showLabel />
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* User menu - always visible; shrink-0 so it is never squeezed (#3191) */}
        <div className="shrink-0">
          <CompactErrorBoundary
            context="navbar-user-profile"
            fallback={(
              <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
                {t('profile.profileUnavailable', 'Profile unavailable')}
              </div>
            )}
          >
            <UserProfileDropdown
              user={user}
              onLogout={logout}
              onPreferences={() => navigate(ROUTES.SETTINGS)}
            />
          </CompactErrorBoundary>
        </div>
      </div>

    </nav>
  )
}
