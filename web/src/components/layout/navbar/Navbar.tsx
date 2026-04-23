import { useState, useEffect, lazy, Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useLocation } from 'react-router-dom'
import { Sun, Moon, Monitor, Menu, X, MoreVertical, ExternalLink, Sparkles } from 'lucide-react'
import { useAuth } from '../../../lib/auth'
import { useSidebarConfig } from '../../../hooks/useSidebarConfig'
import { useTheme } from '../../../hooks/useTheme'
import { useMobile } from '../../../hooks/useMobile'
import { useBranding } from '../../../hooks/useBranding'
import { LearnDropdown } from './LearnDropdown'
import { LogoWithStar } from '../../ui/LogoWithStar'
import { Tooltip } from '../../ui/Tooltip'
import { UserProfileDropdown } from '../UserProfileDropdown'
import { AlertBadge } from '../../ui/AlertBadge'
import { FeatureRequestButton } from '../../feedback'
// Lazy-load SearchDropdown — it imports useSearchIndex which pulls in 5 MCP
// modules (~135 KB). The search bar appears after the chunk loads (near-instant).
const SearchDropdown = lazy(() =>
  import('./SearchDropdown').then(m => ({ default: m.SearchDropdown }))
)

// Lazy-load AgentSelector — agent UI components (~41 KB) are only needed
// when a local kc-agent is available (never on console.kubestellar.io).
const AgentSelector = lazy(() =>
  import('../../agent/AgentSelector').then(m => ({ default: m.AgentSelector }))
)
import { useMissions } from '../../../hooks/useMissions'
import { TokenUsageWidget } from './TokenUsageWidget'
import { ClusterFilterPanel } from './ClusterFilterPanel'
import { AgentStatusIndicator } from './AgentStatusIndicator'
import { RotatingTagline } from './RotatingTagline'
import { UpdateIndicator } from './UpdateIndicator'
import { StreakBadge } from './StreakBadge'
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
  const { config, toggleMobileSidebar } = useSidebarConfig()
  const { isMobile } = useMobile()
  const { t } = useTranslation()
  const branding = useBranding()
  const { missions, isSidebarOpen, openSidebar } = useMissions()
  const missionsNeedingAttention = missions.filter(m =>
    m.status === 'waiting_input' || m.status === 'failed'
  ).length

  // Close mobile more menu on route change
  useEffect(() => {
    setShowMobileMore(false)
  }, [location.pathname])

  return (
    <nav data-tour="navbar" style={{ top: topOffset }} className="fixed left-0 right-0 h-16 glass z-sticky px-3 md:px-6 flex items-center justify-between">
      {/* Left side: Hamburger + Logo — shrink-0 so logo is never compressed */}
      <div className="flex items-center gap-2 md:gap-3 shrink-0">
        {/* Hamburger menu - mobile only */}
        <button
          onClick={toggleMobileSidebar}
          className="p-2 min-w-[44px] min-h-[44px] flex md:hidden items-center justify-center rounded-lg transition-colors hover:bg-black/5 dark:hover:bg-white/10"
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
          aria-label={t('navbar.goHome')}
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
            className="hidden lg:flex items-center p-1.5 hover:bg-secondary rounded-md transition-colors"
            aria-label={t('navbar.viewDocs')}
          >
            <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
          </a>
        </Tooltip>
      </div>

      {/* Search - hidden on small mobile; min-w-0 prevents layout overflow
           when the right-side AI Mission button is visible (#4409).
           min-w-[120px] ensures the input stays usable at narrow widths (#4955). */}
      <div className="hidden sm:flex flex-1 min-w-[120px] max-w-md mx-4">
        <Suspense fallback={null}><SearchDropdown /></Suspense>
      </div>

      {/* Right side — no shrink-0 here so the container participates in flex
           negotiation with the search bar, preventing overlap when the AI Mission
           button is visible (#4409). Individual critical items use shrink-0. */}
      <div className="flex items-center gap-1 md:gap-3">
        {/* Core desktop items: md+ (768px) */}
        <div className="hidden md:flex items-center gap-2">
          {/* Unified Filter */}
          <ClusterFilterPanel />

          {/* Agent Status + Selector — status (Demo/AI pill) on left, selector on right */}
          <AgentStatusIndicator />
          <Suspense fallback={null}><AgentSelector compact /></Suspense>
        </div>

        {/* Extended desktop items: lg+ (1024px) */}
        <div className="hidden lg:flex items-center gap-2">
          {/* Update Indicator */}
          <UpdateIndicator />

          {/* AI Missions — opens the mission sidebar */}
          {!isSidebarOpen && (
            <Tooltip content={t('help.aiMissions')} side="bottom">
              <button
                onClick={openSidebar}
                className="relative flex items-center gap-1.5 px-3 py-1.5 h-9 text-sm font-medium rounded-lg transition-colors bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border border-purple-500/20"
                aria-label={t('missionSidebar.openAIMissions')}
              >
                <Sparkles className="w-4 h-4" />
                <span>{t('missionSidebar.aiMissions')}</span>
                {missionsNeedingAttention > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 flex items-center justify-center w-5 h-5 text-[10px] font-bold bg-purple-500 text-white rounded-full animate-pulse">
                    {missionsNeedingAttention}
                  </span>
                )}
              </button>
            </Tooltip>
          )}

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
          {/* Tour trigger - icon always visible, text shows at xl+ */}
          <LearnDropdown />

          {/* Theme toggle */}
          <Tooltip content={t('help.themeToggle')} side="bottom">
            <button
              onClick={toggleTheme}
              className="p-2 w-9 h-9 flex items-center justify-center shrink-0 hover:bg-secondary rounded-lg transition-colors"
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

        {/* Overflow menu — visible below lg for items hidden at narrow widths */}
        <div className="relative lg:hidden shrink-0">
          <button
            onClick={() => setShowMobileMore(!showMobileMore)}
            className="p-2 min-w-[44px] min-h-[44px] hover:bg-secondary rounded-lg transition-colors"
            aria-label={t('navbar.moreOptions')}
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
              <div className={`fixed ${isMobile ? 'inset-x-0 bottom-0 rounded-t-2xl max-h-[60vh] max-h-[60dvh]' : 'right-4 w-64 rounded-lg'} bg-card border border-border shadow-xl z-modal overflow-hidden`} style={isMobile ? undefined : { top: topOffset + NAVBAR_HEIGHT_PX }}>
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
                      <ClusterFilterPanel />
                    </div>
                    <div className="px-3 py-2">
                      <AgentStatusIndicator />
                    </div>
                    <div className="px-3 py-2">
                      <Suspense fallback={null}><AgentSelector compact /></Suspense>
                    </div>
                    <div className="border-t border-border mx-3 my-1" />
                  </div>

                  {/* Items hidden at <lg (1024px): AI missions, update, token usage, feature request, tour */}
                  {!isSidebarOpen && (
                    <div className="px-3 py-2">
                      <button
                        onClick={() => { openSidebar(); setShowMobileMore(false) }}
                        className="relative flex items-center gap-2 w-full px-3 py-2 text-sm font-medium rounded-lg transition-colors bg-purple-500/10 hover:bg-purple-500/20 text-purple-400"
                        aria-label={t('missionSidebar.openAIMissions')}
                      >
                        <Sparkles className="w-4 h-4 shrink-0" />
                        <span className="truncate min-w-0">{t('missionSidebar.aiMissions')}</span>
                        {missionsNeedingAttention > 0 && (
                          <span className="flex items-center justify-center w-5 h-5 text-[10px] font-bold bg-purple-500 text-white rounded-full animate-pulse">
                            {missionsNeedingAttention}
                          </span>
                        )}
                      </button>
                    </div>
                  )}
                  <div className="px-3 py-2">
                    <UpdateIndicator />
                  </div>
                  <div className="px-3 py-2">
                    <TokenUsageWidget />
                  </div>
                  <div className="px-3 py-2">
                    <FeatureRequestButton />
                  </div>
                  <div className="px-3 py-2">
                    <LearnDropdown />
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* User menu - always visible; shrink-0 so it is never squeezed (#3191) */}
        <div className="shrink-0">
          <UserProfileDropdown
            user={user}
            onLogout={logout}
            onPreferences={() => navigate(ROUTES.SETTINGS)}
          />
        </div>
      </div>

    </nav>
  )
}
